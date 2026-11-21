import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Button,
  Dialog,
  Menu,
  PasswordField,
  showToast,
  TextField,
  Toaster,
  useToastStore,
} from "./index";

afterEach(() => useToastStore.setState({ toasts: [] }));

describe("Button", () => {
  it("calls onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("blocks clicks while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole("button", { name: /Save/ });
    await userEvent.click(button);

    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("PasswordField", () => {
  it("reveals and hides the password", async () => {
    render(<PasswordField label="Password" defaultValue="secret" />);

    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });
});

describe("TextField", () => {
  it("ties the label and the error to the input", () => {
    render(<TextField label="Email" error="Invalid email" />);

    const input = screen.getByLabelText("Email");

    expect(input).toBeInvalid();
    expect(input).toHaveAccessibleDescription("Invalid email");
  });
});

describe("Dialog", () => {
  it("shows its content only when open", () => {
    const { rerender } = render(
      <Dialog open={false} onClose={() => undefined} title="Delete">
        Are you sure?
      </Dialog>,
    );
    expect(screen.queryByText("Are you sure?")).not.toBeInTheDocument();

    rerender(
      <Dialog open onClose={() => undefined} title="Delete">
        Are you sure?
      </Dialog>,
    );

    expect(screen.getByRole("dialog", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });
});

describe("Menu", () => {
  const renderMenu = (onSelect = vi.fn<(id: string) => void>()) => {
    render(
      <Menu
        trigger="Options"
        items={[
          { id: "rename", label: "Rename", onSelect: () => onSelect("rename") },
          { id: "delete", label: "Delete", onSelect: () => onSelect("delete"), danger: true },
        ]}
      />,
    );
    return onSelect;
  };

  it("opens, runs the chosen item and closes", async () => {
    const onSelect = renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(onSelect).toHaveBeenCalledWith("delete");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("is driven by the keyboard", async () => {
    const onSelect = renderMenu();

    await userEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(screen.getByRole("menuitem", { name: "Rename" })).toHaveFocus();

    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(onSelect).toHaveBeenCalledWith("delete");
  });

  it("closes with Escape and gives the focus back", async () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Options" });

    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("toasts", () => {
  it("shows a toast and dismisses it", async () => {
    render(<Toaster />);

    act(() => void showToast("Saved", { duration: 0 }));
    expect(screen.getByRole("status")).toHaveTextContent("Saved");

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("goes away by itself", () => {
    vi.useFakeTimers();
    try {
      render(<Toaster />);

      act(() => void showToast("Saved", { duration: 1000 }));
      expect(screen.getByText("Saved")).toBeInTheDocument();

      act(() => void vi.advanceTimersByTime(1000));
      expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs the action of a toast", async () => {
    const undo = vi.fn();
    render(<Toaster />);

    act(() => void showToast("Moved", { duration: 0, action: { label: "Undo", onClick: undo } }));
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByText("Moved")).not.toBeInTheDocument();
  });
});
