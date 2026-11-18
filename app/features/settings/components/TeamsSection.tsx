import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";

import { useDebouncedValue } from "~/core/hooks/useDebouncedValue";
import { t } from "~/core/i18n";
import type { Role, Workspace, WorkspaceUser } from "~/core/models";
import { Button, cn, showToast, Spinner, TextField } from "~/core/ui";
import { workspacesQuery } from "~/features/workspaces/api";
import { useWorkspace } from "~/features/workspaces/WorkspaceContext";

import {
  type AddUserResult,
  addUserToWorkspace,
  changeRole,
  type FoundUser,
  getMembers,
  type MembersPage,
  searchUsers,
  USER_SEARCH_MIN_LENGTH,
} from "../api";
import { useSettingsLocation } from "../sections";
import { LoadState, OptionCards, SettingsGroup, SettingsLink, SubPageHeader } from "./parts";

const SEARCH_DEBOUNCE_MS = 300;

const roleLabels: Record<Role, "roleAdmin" | "roleEditor"> = {
  ADMIN: "roleAdmin",
  EDITOR: "roleEditor",
};

export const settingsKeys = {
  members: (workspaceId: string) => ["settings", "members", workspaceId] as const,
  userSearch: (workspaceId: string, query: string) =>
    ["settings", "userSearch", workspaceId, query] as const,
};

function roleOptions() {
  return [
    { value: "ADMIN" as const, label: t("roleAdmin"), description: t("roleAdminDescription") },
    { value: "EDITOR" as const, label: t("roleEditor"), description: t("roleEditorDescription") },
  ];
}

/**
 * SettingsTeamsScreen.kt: the workspaces of the user. Each one opens its members, where an
 * admin adds users and changes their roles.
 */
export function TeamsSection() {
  const { page, goTo } = useSettingsLocation();
  const workspaces = useQuery(workspacesQuery);
  const [workspaceId, action, userId] = page;
  const selected = workspaces.data?.find((each) => each.id === workspaceId);

  if (workspaceId && selected) {
    const back = () => goTo("teams", selected.id);
    if (action === "add") return <AddUserPage workspace={selected} onBack={back} />;
    if (action === "user" && userId) {
      return <EditUserPage workspace={selected} userId={userId} onBack={back} />;
    }
    return <MembersPage workspace={selected} onBack={() => goTo("teams")} />;
  }

  return (
    <SettingsGroup title={t("yourTeams")}>
      <LoadState
        isPending={workspaces.isPending}
        isError={workspaces.isError}
        failure={t("errorLoadingTeams")}
        onRetry={() => void workspaces.refetch()}
      >
        <div className="flex flex-col gap-2">
          {workspaces.data?.map((workspace) => (
            <SettingsLink
              key={workspace.id}
              detail={t(roleLabels[workspace.role])}
              onClick={() => goTo("teams", workspace.id)}
            >
              {workspace.name}
            </SettingsLink>
          ))}
        </div>
      </LoadState>
    </SettingsGroup>
  );
}

function useMembers(workspaceId: string) {
  return useInfiniteQuery({
    queryKey: settingsKeys.members(workspaceId),
    queryFn: ({ pageParam, signal }) => getMembers(workspaceId, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last: MembersPage) => (last.hasNextPage ? last.page + 1 : undefined),
  });
}

/** WorkspaceUsersScreen.kt: the members of a workspace, a page at a time. */
export function MembersPage({ workspace, onBack }: { workspace: Workspace; onBack: () => void }) {
  const { goTo } = useSettingsLocation();
  const members = useMembers(workspace.id);
  const isAdmin = workspace.role === "ADMIN";
  const users = members.data?.pages.flatMap((page) => page.users) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader
        title={t("membersOf", { name: workspace.name })}
        onBack={onBack}
        action={
          isAdmin && (
            <Button
              variant="secondary"
              className="h-8"
              onClick={() => goTo("teams", workspace.id, "add")}
            >
              <Plus size={14} aria-hidden />
              {t("addUser")}
            </Button>
          )
        }
      />
      {!isAdmin && <p className="text-sm">{t("onlyAdminsCanAddUsers")}</p>}

      <LoadState
        isPending={members.isPending}
        isError={members.isError && users.length === 0}
        failure={t("failedToLoadUsers")}
        onRetry={() => void members.refetch()}
      >
        {users.length === 0 ? (
          <p className="text-sm">{t("noUsersInWorkspace")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {users.map((user) => (
              <li key={user.id}>
                <MemberRow
                  user={user}
                  onClick={isAdmin ? () => goTo("teams", workspace.id, "user", user.id) : undefined}
                />
              </li>
            ))}
          </ul>
        )}
        {members.hasNextPage && (
          <Button
            variant="secondary"
            className="self-start"
            loading={members.isFetchingNextPage}
            onClick={() => void members.fetchNextPage()}
          >
            {t("loadMore")}
          </Button>
        )}
        {members.isFetchNextPageError && (
          <p role="alert" className="text-sm text-error">
            {t("failedToLoadUsers")}
          </p>
        )}
      </LoadState>
    </div>
  );
}

function MemberRow({ user, onClick }: { user: WorkspaceUser; onClick?: () => void }) {
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-on-bg">{user.name}</span>
        <span className="truncate text-xs text-text-lighter">
          @{user.username} · {user.email}
        </span>
      </span>
      <span className="text-xs text-text-lighter">{t(roleLabels[user.role])}</span>
    </>
  );
  const classes = "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left";

  if (!onClick) return <div className={classes}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("editRoleOf", { name: user.name })}
      className={cn(classes, "hover:bg-options-selector")}
    >
      {content}
    </button>
  );
}

const addFailures: Record<
  Exclude<AddUserResult, "added">,
  "userAlreadyInWorkspace" | "userNotFound"
> = {
  alreadyInWorkspace: "userAlreadyInWorkspace",
  notFound: "userNotFound",
};

/**
 * UserSearchScreen.kt and UserAddScreen.kt: find a user by username, pick a role, add them.
 * The search only lists users who are not in the workspace yet.
 */
export function AddUserPage({ workspace, onBack }: { workspace: Workspace; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<FoundUser | null>(null);
  const [role, setRole] = useState<Role>("EDITOR");
  const debounced = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const searchable = debounced.length >= USER_SEARCH_MIN_LENGTH;

  const results = useQuery({
    queryKey: settingsKeys.userSearch(workspace.id, debounced),
    queryFn: ({ signal }) => searchUsers(workspace.id, debounced, signal),
    enabled: searchable && !picked,
  });

  const adding = useMutation({
    mutationFn: (user: FoundUser) => addUserToWorkspace(workspace.id, user.username, role),
    onSuccess: (result, user) => {
      if (result !== "added") return;
      void queryClient.invalidateQueries({ queryKey: settingsKeys.members(workspace.id) });
      showToast(t("userAdded", { name: user.name }), { kind: "success" });
      onBack();
    },
  });

  const failure = adding.isError
    ? t("failedToAddUser")
    : adding.data && adding.data !== "added"
      ? t(addFailures[adding.data])
      : null;

  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader title={t("addUserToWorkspace", { name: workspace.name })} onBack={onBack} />

      {picked ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-md bg-options-selector px-3 py-2">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm text-on-bg">{picked.name}</span>
              <span className="truncate text-xs text-text-lighter">@{picked.username}</span>
            </span>
            <Button
              variant="ghost"
              className="h-8"
              onClick={() => {
                setPicked(null);
                adding.reset();
              }}
            >
              {t("back")}
            </Button>
          </div>
          <SettingsGroup title={t("selectRole")}>
            <OptionCards
              label={t("selectRole")}
              value={role}
              onChange={setRole}
              options={roleOptions()}
            />
          </SettingsGroup>
          {failure && (
            <p role="alert" className="text-sm text-error">
              {failure}
            </p>
          )}
          <Button
            className="self-start"
            loading={adding.isPending}
            onClick={() => adding.mutate(picked)}
          >
            {t("add")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <TextField
            label={t("searchByUsername")}
            type="search"
            autoComplete="off"
            value={query}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- the page is opened to type it
            autoFocus
            hint={
              query.trim().length < USER_SEARCH_MIN_LENGTH ? t("enterAtLeast2Chars") : undefined
            }
            onChange={(event) => setQuery(event.target.value)}
          />
          {searchable && (
            <SearchResults
              loading={results.isPending || debounced !== query.trim()}
              failed={results.isError}
              users={results.data ?? []}
              onPick={(user) => {
                setPicked(user);
                setRole("EDITOR");
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SearchResults({
  loading,
  failed,
  users,
  onPick,
}: {
  loading: boolean;
  failed: boolean;
  users: FoundUser[];
  onPick: (user: FoundUser) => void;
}) {
  if (loading) return <Spinner />;
  if (failed) {
    return (
      <p role="alert" className="text-sm text-error">
        {t("failedToSearchUsers")}
      </p>
    );
  }
  if (users.length === 0) return <p className="text-sm">{t("noUsersFound")}</p>;

  return (
    <ul aria-label={t("searchByUsername")} className="flex flex-col gap-1">
      {users.map((user) => (
        <li key={user.id}>
          <button
            type="button"
            onClick={() => onPick(user)}
            className="flex w-full flex-col items-start rounded-md px-3 py-2 text-left hover:bg-options-selector"
          >
            <span className="text-sm text-on-bg">{user.name}</span>
            <span className="text-xs text-text-lighter">@{user.username}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** UserEditScreen.kt: changes a member between admin and editor. */
export function EditUserPage({
  workspace,
  userId,
  onBack,
}: {
  workspace: Workspace;
  userId: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const { user: me } = useWorkspace();
  const members = useMembers(workspace.id);
  const user = members.data?.pages.flatMap((page) => page.users).find((each) => each.id === userId);
  const [role, setRole] = useState<Role | null>(null);
  const chosen = role ?? user?.role ?? null;

  const saving = useMutation({
    mutationFn: (newRole: Role) => changeRole(workspace.id, userId, newRole),
    onSuccess: (result, newRole) => {
      if (result !== "changed") return;
      queryClient.setQueryData<InfiniteData<MembersPage>>(
        settingsKeys.members(workspace.id),
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              users: page.users.map((each) =>
                each.id === userId ? { ...each, role: newRole } : each,
              ),
            })),
          },
      );
      void queryClient.invalidateQueries({ queryKey: settingsKeys.members(workspace.id) });
      // The user's own role decides what they can do in the workspace.
      if (userId === me.id)
        void queryClient.invalidateQueries({ queryKey: workspacesQuery.queryKey });
      onBack();
    },
  });

  const failure = saving.isError
    ? t("failedToUpdateRole")
    : saving.data === "lastAdmin"
      ? t("workspaceMustHaveAdmin")
      : null;

  return (
    <div className="flex flex-col gap-4">
      <SubPageHeader title={t("editUserRole")} onBack={onBack} />
      <LoadState
        isPending={members.isPending}
        isError={members.isError || (!members.isPending && !user)}
        failure={t("failedToLoadUsers")}
        onRetry={() => void members.refetch()}
      >
        {user && (
          <div className="flex flex-col gap-4">
            <MemberRow user={user} />
            <p className="text-sm">
              {t("currentRole")}: {t(roleLabels[user.role])}
            </p>
            <SettingsGroup title={t("selectRole")}>
              <OptionCards
                label={t("selectRole")}
                value={chosen}
                onChange={(next) => {
                  setRole(next);
                  saving.reset();
                }}
                options={roleOptions()}
              />
            </SettingsGroup>
            {failure && (
              <p role="alert" className="text-sm text-error">
                {failure}
              </p>
            )}
            <Button
              className="self-start"
              disabled={!chosen || chosen === user.role}
              loading={saving.isPending}
              onClick={() => chosen && saving.mutate(chosen)}
            >
              {t("save")}
            </Button>
          </div>
        )}
      </LoadState>
    </div>
  );
}
