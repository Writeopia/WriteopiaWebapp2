import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { paths } from "~/features/auth/session";

import { aUser } from "../../../test/fixtures";
import { signedIn } from "../../../test/msw/handlers";
import { server } from "../../../test/msw/server";
import { renderRoute } from "../../../test/render";
import AuthLayout from "./layout";

describe("AuthLayout", () => {
  it("sends someone who turns out to be signed in to the start", async () => {
    server.use(...signedIn(aUser()));

    renderRoute(AuthLayout, { path: paths.login, destinations: [paths.start] });

    expect(await screen.findByText(`at ${paths.start}`)).toBeInTheDocument();
  });
});
