import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { queryClient } from "~/core/query/queryClient";
import { paths, setSessionUser } from "~/features/auth/session";
import { getSelectedWorkspaceId, selectWorkspace } from "~/features/workspaces/api";

import { aUser, aWorkspace } from "../../test/fixtures";
import { apiUrl } from "../../test/msw/handlers";
import { server } from "../../test/msw/server";
import { renderRoute } from "../../test/render";
import AccountDeletionStarted from "./account-deletion-started";
import ChooseWorkspace from "./workspaces";

function withWorkspaces(workspaces: object[]) {
  server.use(http.get(apiUrl("/workspace/user"), () => HttpResponse.json(workspaces)));
}

describe("ChooseWorkspace", () => {
  it("lists the workspaces and opens the app in the chosen one", async () => {
    withWorkspaces([
      aWorkspace({ id: "w1", name: "Personal", documentCount: 12 }),
      aWorkspace({ id: "w2", name: "Team", role: "EDITOR", documentCount: 3 }),
    ]);
    renderRoute(ChooseWorkspace, { path: paths.workspaces, destinations: [paths.app] });

    const team = await screen.findByRole("button", { name: /Team/ });
    expect(team).toHaveTextContent("3 documents");
    expect(team).toHaveTextContent("Editor");
    expect(screen.getByRole("button", { name: /Personal/ })).toHaveTextContent("Admin");

    await userEvent.click(team);

    expect(await screen.findByText(`at ${paths.app}`)).toBeInTheDocument();
    expect(getSelectedWorkspaceId()).toBe("w2");
  });

  it("offers to try again when the list cannot be loaded", async () => {
    let fail = true;
    server.use(
      http.get(apiUrl("/workspace/user"), () =>
        fail ? new HttpResponse("boom", { status: 500 }) : HttpResponse.json([aWorkspace()]),
      ),
    );
    renderRoute(ChooseWorkspace, { path: paths.workspaces });

    expect(await screen.findByRole("alert")).toHaveTextContent("Error loading workspaces");

    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("button", { name: /Personal/ })).toBeInTheDocument();
  });

  it("says so when there is no workspace", async () => {
    withWorkspaces([]);
    renderRoute(ChooseWorkspace, { path: paths.workspaces });

    expect(await screen.findByText(/You have no workspaces yet/)).toBeInTheDocument();
  });

  it("creates a workspace and shows it in the list", async () => {
    const workspaces = [aWorkspace({ id: "w1", name: "Personal" })];
    const created: unknown[] = [];
    server.use(
      http.get(apiUrl("/workspace/user"), () => HttpResponse.json(workspaces)),
      http.post(apiUrl("/workspace/create"), async ({ request }) => {
        const body = (await request.json()) as { name: string };
        created.push(body);
        workspaces.push(aWorkspace({ id: "w2", name: body.name, documentCount: 0 }));
        return new HttpResponse(null, { status: 201 });
      }),
    );
    renderRoute(ChooseWorkspace, { path: paths.workspaces });

    await userEvent.click(await screen.findByRole("button", { name: "Create workspace" }));
    const dialog = screen.getByRole("dialog", { name: "Create workspace" });
    expect(within(dialog).getByRole("button", { name: "Create" })).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText("Workspace name"), " Team ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create" }));

    expect(await screen.findByRole("button", { name: /Team/ })).toBeInTheDocument();
    expect(created).toEqual([{ name: "Team" }]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says so when the workspace cannot be created", async () => {
    withWorkspaces([aWorkspace()]);
    server.use(
      http.post(apiUrl("/workspace/create"), () => new HttpResponse("nope", { status: 500 })),
    );
    renderRoute(ChooseWorkspace, { path: paths.workspaces });

    await userEvent.click(await screen.findByRole("button", { name: "Create workspace" }));
    await userEvent.type(screen.getByLabelText("Workspace name"), "Team");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Failed to create workspace")).toBeInTheDocument();
  });

  it("signs out, forgetting the session and the workspace", async () => {
    withWorkspaces([aWorkspace()]);
    let loggedOut = false;
    server.use(
      http.post(apiUrl("/auth/logout/web"), () => {
        loggedOut = true;
        return new HttpResponse("Logged out");
      }),
    );
    setSessionUser(aUser());
    selectWorkspace("w1");
    renderRoute(ChooseWorkspace, { path: paths.workspaces, destinations: [paths.login] });

    await userEvent.click(await screen.findByRole("button", { name: "Logout" }));

    expect(await screen.findByText(`at ${paths.login}`)).toBeInTheDocument();
    expect(loggedOut).toBe(true);
    expect(getSelectedWorkspaceId()).toBeNull();
    expect(queryClient.getQueryData(["session", "user"])).toBeUndefined();
  });
});

describe("AccountDeletionStarted", () => {
  it("leaves to the login even when the backend refuses the logout", async () => {
    server.use(
      http.post(apiUrl("/auth/logout/web"), () => new HttpResponse("nope", { status: 500 })),
    );
    renderRoute(AccountDeletionStarted, {
      path: paths.accountDeletionStarted,
      destinations: [paths.login],
    });

    expect(screen.getByText("Account deletion started")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Logout" }));

    expect(await screen.findByText(`at ${paths.login}`)).toBeInTheDocument();
  });
});
