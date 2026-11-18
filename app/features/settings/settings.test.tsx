import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useLocation } from "react-router";
import { describe, expect, it } from "vitest";

import type { DocumentTag, WorkspaceUser } from "~/core/models";
import { readPreference } from "~/core/storage";
import { ACCENT_COLOR_KEY, COLOR_THEME_KEY } from "~/core/theme/theme";
import { paths } from "~/features/auth/session";

import { aUser, aWorkspace, WORKSPACE_ID } from "../../../test/fixtures";
import { apiUrl } from "../../../test/msw/handlers";
import { menuBackend } from "../../../test/msw/menuBackend";
import { server } from "../../../test/msw/server";
import { renderAppRoute } from "../../../test/render";
import { formatCompactNumber, usageShare } from "./components/AiSection";
import { SettingsDialog } from "./components/SettingsDialog";
import { isTagNameTaken } from "./components/WorkspaceSection";
import { parseSettingsLocation, settingsValue } from "./sections";

/** The dialog, and the query string of the page, to see where the dialog sent it. */
function Settings() {
  const location = useLocation();
  return (
    <>
      <SettingsDialog onClose={() => undefined} />
      <output aria-label="address">{location.search}</output>
    </>
  );
}

const user = aUser({ tier: "PREMIUM" });
const personal = aWorkspace();
const team = aWorkspace({ id: "team", name: "Team", role: "EDITOR" });

function renderSettings(value = "account") {
  server.use(http.get(apiUrl("/workspace/user"), () => HttpResponse.json([personal, team])));
  return renderAppRoute(Settings, {
    path: "/app",
    search: `?settings=${value}`,
    destinations: [paths.accountDeletionStarted, paths.workspaces, paths.resetPassword],
    session: { user, workspace: personal },
  });
}

const dialog = () => screen.getByRole("dialog", { name: "Settings" });
const address = () =>
  decodeURIComponent(screen.getByRole("status", { name: "address" }).textContent ?? "");

async function openSection(name: string) {
  await userEvent.click(
    within(screen.getByRole("navigation", { name: "Settings sections" })).getByRole("button", {
      name,
    }),
  );
}

function aMember(overrides: Partial<WorkspaceUser> = {}): WorkspaceUser {
  return {
    id: "user-2",
    name: "Bruno",
    email: "bruno@writeopia.io",
    username: "bruno",
    role: "EDITOR",
    ...overrides,
  };
}

function aTag(overrides: Partial<DocumentTag> = {}): DocumentTag {
  return {
    id: "tag-1",
    workspaceId: WORKSPACE_ID,
    name: "Recipes",
    description: "Things to cook",
    createdAt: 1_700_000_000_000,
    lastUpdatedAt: 1_700_000_000_000,
    deleted: false,
    ...overrides,
  };
}

describe("the place in the settings", () => {
  it("reads the section and the page from the address", () => {
    expect(parseSettingsLocation("teams/ws-1/user/u-1")).toEqual({
      section: "teams",
      page: ["ws-1", "user", "u-1"],
    });
    expect(parseSettingsLocation("workspace")).toEqual({ section: "workspace", page: [] });
  });

  it("opens the account for an unknown or missing section", () => {
    expect(parseSettingsLocation("billing/x")).toEqual({ section: "account", page: [] });
    expect(parseSettingsLocation(null)).toEqual({ section: "account", page: [] });
  });

  it("writes ids that hold a slash so they read back the same", () => {
    const value = settingsValue("teams", "a/b", "add");
    expect(parseSettingsLocation(value)).toEqual({ section: "teams", page: ["a/b", "add"] });
  });
});

describe("the settings dialog", () => {
  it("lists the sections, opens the one in the address and shows the version", () => {
    renderSettings("appearance");

    const nav = screen.getByRole("navigation", { name: "Settings sections" });
    expect(
      within(nav)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Account", "Appearance", "AI", "Workspace", "Teams"]);
    expect(within(nav).getByRole("button", { name: "Appearance" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(dialog()).getByRole("radiogroup", { name: "Color theme" })).toBeInTheDocument();
    expect(within(dialog()).getByText(/^Version \d+\.\d+\.\d+ \(.+\)$/)).toBeInTheDocument();
  });

  it("moves between sections in the address", async () => {
    renderSettings();

    await openSection("Teams");

    expect(address()).toBe("?settings=teams");
    expect(await within(dialog()).findByRole("button", { name: /Personal/ })).toBeInTheDocument();
  });
});

describe("the account section", () => {
  it("shows the account and the ways to change workspace and password", () => {
    renderSettings();

    expect(within(dialog()).getByText("Account: Ana - PREMIUM")).toBeInTheDocument();
    expect(within(dialog()).getByRole("link", { name: "Change workspace" })).toHaveAttribute(
      "href",
      paths.workspaces,
    );
    expect(within(dialog()).getByRole("link", { name: "Reset your password" })).toHaveAttribute(
      "href",
      paths.resetPassword,
    );
  });

  it("starts the export of the chosen workspace", async () => {
    const exported: string[] = [];
    server.use(
      http.post(apiUrl("/workspace/:ws/export"), ({ params }) => {
        exported.push(String(params.ws));
        return HttpResponse.json({ message: "Export job started" }, { status: 202 });
      }),
    );
    renderSettings();

    await userEvent.click(screen.getByRole("button", { name: "Export Workspace" }));
    const exportDialog = screen.getByRole("dialog", { name: "Export Workspace" });
    await userEvent.click(await within(exportDialog).findByRole("radio", { name: "Team" }));
    await userEvent.click(within(exportDialog).getByRole("button", { name: "Start Export" }));

    expect(
      await within(exportDialog).findByText(
        "Export started. A download link will be sent to your email when ready.",
      ),
    ).toBeInTheDocument();
    expect(exported).toEqual(["team"]);
  });

  it("says when the export could not start", async () => {
    server.use(
      http.post(apiUrl("/workspace/:ws/export"), () => new HttpResponse(null, { status: 403 })),
    );
    renderSettings();

    await userEvent.click(screen.getByRole("button", { name: "Export Workspace" }));
    const exportDialog = screen.getByRole("dialog", { name: "Export Workspace" });
    await within(exportDialog).findByRole("radio", { name: "Personal" });
    await userEvent.click(within(exportDialog).getByRole("button", { name: "Start Export" }));

    expect(await within(exportDialog).findByRole("alert")).toHaveTextContent(
      "Failed to start export. Please try again.",
    );
  });

  it("deletes the account only once the email is typed", async () => {
    let deleted = 0;
    server.use(
      http.delete(apiUrl("/auth/account"), () => {
        deleted += 1;
        return HttpResponse.json({ success: true }, { status: 202 });
      }),
    );
    renderSettings();

    await userEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    const confirm = screen.getByRole("dialog", { name: "Are you sure?" });
    expect(within(confirm).getByText("All your notes will be deleted.")).toBeInTheDocument();
    const confirmButton = within(confirm).getByRole("button", { name: "Confirm" });
    const field = within(confirm).getByLabelText(/Type your email/);

    expect(confirmButton).toBeDisabled();
    await userEvent.type(field, "ana@writeopia");
    expect(confirmButton).toBeDisabled();
    await userEvent.type(field, ".IO ");
    expect(confirmButton).toBeEnabled();

    await userEvent.click(confirmButton);

    expect(await screen.findByText(`at ${paths.accountDeletionStarted}`)).toBeInTheDocument();
    expect(deleted).toBe(1);
  });

  it("says when the account could not be deleted", async () => {
    server.use(http.delete(apiUrl("/auth/account"), () => new HttpResponse(null, { status: 500 })));
    renderSettings();

    await userEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    const confirm = screen.getByRole("dialog", { name: "Are you sure?" });
    await userEvent.type(within(confirm).getByLabelText(/Type your email/), user.email);
    await userEvent.click(within(confirm).getByRole("button", { name: "Confirm" }));

    expect(await within(confirm).findByRole("alert")).toHaveTextContent(
      "Could not delete your account. Please try again.",
    );
  });
});

describe("the appearance section", () => {
  it("keeps the theme and the accent in this browser", async () => {
    renderSettings("appearance");

    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
    await userEvent.click(screen.getByRole("radio", { name: "Orange" }));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.accent).toBe("orange");
    expect(readPreference(COLOR_THEME_KEY)).toBe("dark");
    expect(readPreference(ACCENT_COLOR_KEY)).toBe("orange");
    expect(screen.getByRole("radio", { name: "Orange" })).toBeChecked();
  });
});

describe("the AI section", () => {
  it("writes token counts the short way and caps the share at the quota", () => {
    expect(formatCompactNumber(950)).toBe("950");
    expect(formatCompactNumber(12_300)).toBe("12.3K");
    expect(formatCompactNumber(2_000_000)).toBe("2M");
    expect(usageShare({ totalTokens: 250, quota: 1000 })).toBe(0.25);
    expect(usageShare({ totalTokens: 5000, quota: 1000 })).toBe(1);
    expect(usageShare({ totalTokens: 5000, quota: null })).toBe(0);
  });

  it("runs on the cloud and shows the usage of the month", async () => {
    server.use(
      http.get(apiUrl("/ai/usage"), () =>
        HttpResponse.json({ totalTokens: 12_300, quota: 100_000, requestCount: 4 }),
      ),
    );
    renderSettings("ai");

    expect(screen.getByRole("radio", { name: /Cloud AI/ })).toBeChecked();
    expect(screen.getByText(/runs on the Writeopia servers/)).toBeInTheDocument();
    expect(await screen.findByText("12.3K / 100K")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Cloud AI Usage" })).toHaveAttribute(
      "aria-valuenow",
      "12",
    );
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.queryByText("No usage data available")).not.toBeInTheDocument();
  });

  it("says when there is no usage yet", async () => {
    server.use(
      http.get(apiUrl("/ai/usage"), () => HttpResponse.json({ totalTokens: 0, quota: 1000 })),
    );
    renderSettings("ai");

    expect(screen.getByText("Loading usage data...")).toBeInTheDocument();
    expect(await screen.findByText("No usage data available")).toBeInTheDocument();
  });

  it("offers to try again when the usage cannot be read", async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl("/ai/usage"), () => {
        calls += 1;
        return calls === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ totalTokens: 10, quota: 1000, requestCount: 1 });
      }),
    );
    renderSettings("ai");

    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("10 / 1K")).toBeInTheDocument();
  });
});

describe("the workspace section", () => {
  it("shows the name and opens the pages of its content", async () => {
    server.use(http.get(apiUrl("/ai/header-images/:ws"), () => HttpResponse.json({ images: [] })));
    renderSettings("workspace");

    expect(within(dialog()).getByText("Personal")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Header images/ }));

    expect(address()).toBe("?settings=workspace/header-images");
    expect(
      await screen.findByText(
        "No header images yet. Draw one with AI from the header of a document.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(address()).toBe("?settings=workspace");
  });

  it("deletes a header image after asking", async () => {
    const deleted: string[] = [];
    let images = [
      { id: "img-1", url: "https://cdn.test/1.png" },
      { id: "img-2", url: "https://cdn.test/2.png" },
    ];
    server.use(
      http.get(apiUrl("/ai/header-images/:ws"), () => HttpResponse.json({ images })),
      http.delete(apiUrl("/ai/header-images/:ws/:imageId"), ({ params }) => {
        deleted.push(`${String(params.ws)}/${String(params.imageId)}`);
        images = images.filter((image) => image.id !== params.imageId);
        return HttpResponse.json({ success: true });
      }),
    );
    renderSettings("workspace/header-images");

    const deleteButtons = await screen.findAllByRole("button", { name: "Delete header image" });
    expect(deleteButtons).toHaveLength(2);
    await userEvent.click(deleteButtons[0]!);
    const confirm = screen.getByRole("dialog", { name: "Delete header image?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Delete header image" })).toHaveLength(1),
    );
    expect(deleted).toEqual([`${WORKSPACE_ID}/img-1`]);
    expect(screen.queryByRole("dialog", { name: "Delete header image?" })).not.toBeInTheDocument();
  });

  it("says when a header image could not be deleted", async () => {
    server.use(
      http.get(apiUrl("/ai/header-images/:ws"), () =>
        HttpResponse.json({ images: [{ id: "img-1", url: "https://cdn.test/1.png" }] }),
      ),
      http.delete(
        apiUrl("/ai/header-images/:ws/:imageId"),
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderSettings("workspace/header-images");

    await userEvent.click(await screen.findByRole("button", { name: "Delete header image" }));
    const confirm = screen.getByRole("dialog", { name: "Delete header image?" });
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete" }));

    expect(await within(confirm).findByRole("alert")).toHaveTextContent(
      "The header image could not be deleted.",
    );
  });

  it("offers to load the header images again when they fail", async () => {
    let calls = 0;
    server.use(
      http.get(apiUrl("/ai/header-images/:ws"), () => {
        calls += 1;
        // A server error is not retried by itself: only the button asks again.
        return calls === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ images: [{ id: "img-1", url: "https://cdn.test/1.png" }] });
      }),
    );
    renderSettings("workspace/header-images");

    expect(await screen.findByText("The header images could not be loaded.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Delete header image" })).toBeInTheDocument();
  });
});

describe("the tags page", () => {
  /** The menu backend, which also keeps the tags it is sent, like the real one. */
  function tagsBackend(tags: DocumentTag[]) {
    const { state } = menuBackend({ tags });
    const saved: DocumentTag[] = [];
    server.use(
      http.post(apiUrl("/docs/workspace/tag"), async ({ request }) => {
        const body = (await request.json()) as { tags: DocumentTag[]; workspaceId: string };
        expect(body.workspaceId).toBe(WORKSPACE_ID);
        saved.push(...body.tags);
        for (const tag of body.tags) {
          state.tags = [...state.tags.filter((each) => each.id !== tag.id), tag];
        }
        return HttpResponse.json({ success: true });
      }),
    );
    return saved;
  }

  it("lists the tags and creates a new one", async () => {
    const saved = tagsBackend([aTag()]);
    renderSettings("workspace/tags");

    expect(await screen.findByText("Recipes")).toBeInTheDocument();
    expect(screen.getByText("Things to cook")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "New tag" }));
    const form = screen.getByRole("dialog", { name: "New tag" });
    await userEvent.type(within(form).getByLabelText("Name"), "  Travel ");
    await userEvent.type(within(form).getByLabelText("Description"), "Trips");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Travel")).toBeInTheDocument();
    expect(saved).toEqual([
      expect.objectContaining({
        name: "Travel",
        description: "Trips",
        workspaceId: WORKSPACE_ID,
        deleted: false,
      }),
    ]);
  });

  it("refuses a name the catalogue already has", async () => {
    tagsBackend([aTag()]);
    renderSettings("workspace/tags");

    await userEvent.click(await screen.findByRole("button", { name: "New tag" }));
    const form = screen.getByRole("dialog", { name: "New tag" });
    await userEvent.type(within(form).getByLabelText("Name"), " recipes");

    expect(within(form).getByText("A tag with this name exists already.")).toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("edits a tag, keeping its own name allowed", async () => {
    const saved = tagsBackend([aTag(), aTag({ id: "tag-2", name: "Work" })]);
    renderSettings("workspace/tags");

    await userEvent.click(await screen.findByRole("button", { name: "Edit Recipes" }));
    const form = screen.getByRole("dialog", { name: "Edit tag" });
    expect(within(form).getByRole("button", { name: "Save" })).toBeEnabled();
    const description = within(form).getByLabelText("Description");
    await userEvent.clear(description);
    await userEvent.type(description, "Food");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Food")).toBeInTheDocument();
    expect(saved).toEqual([
      expect.objectContaining({ id: "tag-1", name: "Recipes", description: "Food" }),
    ]);
  });

  it("deletes a tag by sending it as deleted", async () => {
    const saved = tagsBackend([aTag()]);
    renderSettings("workspace/tags");

    await userEvent.click(await screen.findByRole("button", { name: "Delete Recipes" }));
    const confirm = screen.getByRole("dialog", { name: "Delete tag?" });
    expect(
      within(confirm).getByText("“Recipes” will be removed from every document that carries it."),
    ).toBeInTheDocument();
    await userEvent.click(within(confirm).getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByText("No tags yet. Create one to organize your documents."),
    ).toBeInTheDocument();
    expect(saved).toEqual([expect.objectContaining({ id: "tag-1", deleted: true })]);
  });

  it("compares names without case and the spaces around them", () => {
    const tags = [aTag({ id: "a", name: "Work " })];
    expect(isTagNameTaken(tags, " work")).toBe(true);
    expect(isTagNameTaken(tags, "work", "a")).toBe(false);
    expect(isTagNameTaken(tags, "Workout")).toBe(false);
  });
});

describe("the teams section", () => {
  function membersBackend(pages: WorkspaceUser[][]) {
    server.use(
      http.get(apiUrl("/workspace/:ws/users/paginated"), ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get("page"));
        return HttpResponse.json({
          users: pages[page - 1] ?? [],
          page,
          pageSize: 20,
          totalCount: pages.flat().length,
          totalPages: pages.length,
          hasNextPage: page < pages.length,
        });
      }),
    );
  }

  it("lists the workspaces with the user's role", async () => {
    renderSettings("teams");

    expect(await screen.findByRole("button", { name: /Personal.*Admin/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Team.*Editor/ })).toBeInTheDocument();
  });

  it("shows the members a page at a time", async () => {
    membersBackend([
      [
        aMember({
          id: "u-1",
          name: "Ana",
          username: "ana",
          email: "ana@writeopia.io",
          role: "ADMIN",
        }),
        aMember(),
      ],
      [aMember({ id: "u-3", name: "Carla", username: "carla" })],
    ]);
    renderSettings("teams");

    await userEvent.click(await screen.findByRole("button", { name: /Personal/ }));
    expect(address()).toBe(`?settings=teams/${WORKSPACE_ID}`);
    expect(await screen.findByText("Bruno")).toBeInTheDocument();
    expect(screen.getByText("@bruno · bruno@writeopia.io")).toBeInTheDocument();
    expect(screen.queryByText("Carla")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Carla")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("does not let an editor add users or change roles", async () => {
    membersBackend([[aMember()]]);
    renderSettings("teams/team");

    expect(await screen.findByText("Bruno")).toBeInTheDocument();
    expect(screen.getByText("Only admins can add users")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add user" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit the role of Bruno" }),
    ).not.toBeInTheDocument();
  });

  describe("adding a user", () => {
    function searchBackend(status = 200) {
      const added: unknown[] = [];
      membersBackend([
        [
          aMember({
            id: "u-1",
            name: "Ana",
            username: "ana",
            email: "ana@writeopia.io",
            role: "ADMIN",
          }),
        ],
      ]);
      server.use(
        http.get(apiUrl("/workspace/:ws/users/search"), ({ request }) => {
          const params = new URL(request.url).searchParams;
          expect(params.get("pageSize")).toBe("5");
          return HttpResponse.json({
            users: [{ id: "u-9", name: "Carla", username: `${params.get("username")}la` }],
            page: 1,
            pageSize: 5,
            hasNextPage: false,
          });
        }),
        http.post(apiUrl("/workspace/user"), async ({ request }) => {
          added.push(await request.json());
          return status === 200
            ? HttpResponse.json({ message: "User added to workspace" })
            : new HttpResponse(null, { status });
        }),
      );
      return added;
    }

    async function pickCarla() {
      renderSettings(`teams/${WORKSPACE_ID}`);
      await userEvent.click(await screen.findByRole("button", { name: "Add user" }));
      expect(address()).toBe(`?settings=teams/${WORKSPACE_ID}/add`);

      const field = screen.getByLabelText("Search by username");
      await userEvent.type(field, "c");
      expect(screen.getByText("Enter at least 2 characters to search")).toBeInTheDocument();
      await userEvent.type(field, "ar");
      await userEvent.click(await screen.findByRole("button", { name: /Carla/ }));
    }

    it("searches by username, picks a role and adds the user", async () => {
      const added = searchBackend();
      await pickCarla();

      await userEvent.click(screen.getByRole("radio", { name: /Admin/ }));
      await userEvent.click(screen.getByRole("button", { name: "Add" }));

      expect(await screen.findByText("Carla was added to the workspace.")).toBeInTheDocument();
      expect(address()).toBe(`?settings=teams/${WORKSPACE_ID}`);
      expect(added).toEqual([{ username: "carla", workspaceId: WORKSPACE_ID, role: "ADMIN" }]);
    });

    it.each([
      [409, "This user is already in the workspace."],
      [404, "User not found."],
      [500, "Failed to add user. Please try again."],
    ])("says why a %i refused the user", async (status, message) => {
      searchBackend(status);
      await pickCarla();

      await userEvent.click(screen.getByRole("button", { name: "Add" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(address()).toBe(`?settings=teams/${WORKSPACE_ID}/add`);
    });

    it("says when nobody matches", async () => {
      membersBackend([[]]);
      server.use(
        http.get(apiUrl("/workspace/:ws/users/search"), () =>
          HttpResponse.json({ users: [], page: 1, pageSize: 5, hasNextPage: false }),
        ),
      );
      renderSettings(`teams/${WORKSPACE_ID}/add`);

      await userEvent.type(await screen.findByLabelText("Search by username"), "zz");

      expect(await screen.findByText("No users found")).toBeInTheDocument();
    });
  });

  describe("changing a role", () => {
    function roleBackend(status = 200) {
      const changes: unknown[] = [];
      membersBackend([
        [
          aMember({
            id: "u-1",
            name: "Ana",
            username: "ana",
            email: "ana@writeopia.io",
            role: "ADMIN",
          }),
          aMember(),
        ],
      ]);
      server.use(
        http.put(apiUrl("/workspace/role"), async ({ request }) => {
          changes.push(await request.json());
          return status === 200
            ? HttpResponse.json({ message: "Role changed" })
            : new HttpResponse(null, { status });
        }),
      );
      return changes;
    }

    it("makes an editor an admin", async () => {
      const changes = roleBackend();
      renderSettings(`teams/${WORKSPACE_ID}`);

      await userEvent.click(await screen.findByRole("button", { name: "Edit the role of Bruno" }));
      expect(address()).toBe(`?settings=teams/${WORKSPACE_ID}/user/user-2`);
      expect(screen.getByText("Current role: Editor")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

      await userEvent.click(screen.getByRole("radio", { name: /Admin/ }));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(address()).toBe(`?settings=teams/${WORKSPACE_ID}`));
      expect(changes).toEqual([{ workspaceId: WORKSPACE_ID, userId: "user-2", newRole: "ADMIN" }]);
    });

    it("keeps the last admin", async () => {
      roleBackend(409);
      renderSettings(`teams/${WORKSPACE_ID}/user/u-1`);

      await userEvent.click(await screen.findByRole("radio", { name: /Editor/ }));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Workspace must have at least one admin.",
      );
    });

    it("says when the role could not be changed", async () => {
      roleBackend(500);
      renderSettings(`teams/${WORKSPACE_ID}/user/user-2`);

      await userEvent.click(await screen.findByRole("radio", { name: /Admin/ }));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Failed to update role. Please try again.",
      );
    });
  });
});
