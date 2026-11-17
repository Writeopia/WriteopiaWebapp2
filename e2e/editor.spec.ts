import { expect, type Page, test } from "@playwright/test";

import { FakeBackend, step, titleStep } from "./backend";

const DOCUMENT_ID = "doc-1";

async function open(page: Page, backend: FakeBackend) {
  page.on("pageerror", (error) => console.error(`page error: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") console.error(`console: ${message.text()}`);
  });
  await backend.install(page);
  await page.goto(`/app/document/${DOCUMENT_ID}`);
  // The dev server prepares its modules on the first visit.
  await expect(page.getByRole("textbox", { name: "Title" })).toBeVisible({ timeout: 30_000 });
}

/** The text block holding [text]. */
function block(page: Page, text: string) {
  return page.locator("[data-text-id]", { hasText: text });
}

async function saved(page: Page) {
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
}

test("types into a paragraph and keeps it after a reload", async ({ page }) => {
  const backend = new FakeBackend(DOCUMENT_ID, [
    titleStep("Groceries"),
    step("a", "0001000001", { text: "Milk" }),
  ]);
  await open(page, backend);

  await block(page, "Milk").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" and eggs");
  await expect(block(page, "Milk and eggs")).toBeVisible();

  await expect.poll(() => backend.texts()).toEqual(["Groceries", "Milk and eggs"]);
  await saved(page);

  await page.reload();
  await expect(block(page, "Milk and eggs")).toBeVisible();
});

function twoLines() {
  return new FakeBackend(DOCUMENT_ID, [
    titleStep("Notes"),
    step("a", "0001000001", { text: "First" }),
    step("b", "0001000002", { text: "Second" }),
  ]);
}

/** Pastes [data] into the focused element, as the browser does on ⌘V. */
async function paste(
  page: Page,
  data: Record<string, string>,
  files: { name: string; type: string }[] = [],
) {
  await page.evaluate(
    ({ data, files }) => {
      const transfer = new DataTransfer();
      for (const [type, value] of Object.entries(data)) transfer.setData(type, value);
      for (const file of files) {
        transfer.items.add(
          new File([new Uint8Array([137, 80, 78, 71])], file.name, { type: file.type }),
        );
      }
      const event = new ClipboardEvent("paste", {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      });
      document.activeElement?.dispatchEvent(event);
    },
    { data, files },
  );
}

test("Enter splits a line and Backspace at its start joins it back", async ({ page }) => {
  const backend = twoLines();
  await open(page, backend);

  await block(page, "First").click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await page.keyboard.type("X");
  await expect.poll(() => backend.texts()).toEqual(["Notes", "Fir", "Xst", "Second"]);

  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Backspace");
  await expect.poll(() => backend.texts()).toEqual(["Notes", "FirXst", "Second"]);
  await page.keyboard.type("!");
  await expect(block(page, "Fir!Xst")).toBeVisible();
});

test("the arrows move the caret between blocks", async ({ page }) => {
  await open(page, twoLines());

  await block(page, "First").click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.type("<");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("End");
  await page.keyboard.type("!");
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveText("Notes!");

  await page.keyboard.press("ArrowRight");
  await page.keyboard.type("^");
  await expect(block(page, "^First")).toBeVisible();
  // Down keeps the column, so where "<" lands in "Second" depends on the font.
  await expect(page.locator('[data-text-id="b"]')).toHaveText(/^S[a-z]*<[a-z]*$/);
});

test("line commands make headings and lists, and Enter continues a list", async ({ page }) => {
  const backend = twoLines();
  await open(page, backend);

  await block(page, "Second").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("## Plan");
  await expect(page.getByRole("textbox", { name: "Heading 2" })).toHaveText("Plan");

  await page.keyboard.press("Enter");
  await page.keyboard.type("- milk");
  await page.keyboard.press("Enter");
  await page.keyboard.type("eggs");
  await expect(page.getByRole("textbox", { name: "List item" })).toHaveCount(2);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "List item" })).toHaveCount(2);

  await expect
    .poll(() => backend.ordered().map((each) => (each.type as { name: string }).name))
    .toEqual([
      "title",
      "message",
      "message",
      "message",
      "unordered_list_item",
      "unordered_list_item",
      "message",
    ]);
});

test("the slash menu changes the line", async ({ page }) => {
  const backend = twoLines();
  await open(page, backend);

  await block(page, "Second").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/che");
  await expect(page.getByRole("option", { name: /Checkbox/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.type("buy bread");
  await expect(page.getByRole("checkbox", { name: "Done: buy bread" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Done: buy bread" }).check();
  await expect
    .poll(() => backend.ordered().find((each) => each.text === "buy bread")?.checked)
    .toBe(true);
});

test("formats selected text with the toolbar and the keyboard", async ({ page }) => {
  const backend = twoLines();
  await open(page, backend);

  await block(page, "First").dblclick({ position: { x: 12, y: 10 } });
  await expect(page.getByRole("toolbar", { name: "Text format" })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+b");
  await expect(block(page, "First").locator("strong")).toHaveText("First");

  await page.getByRole("button", { name: "Yellow highlight" }).click();
  await expect(block(page, "First").locator(".wr-hl-yellow")).toHaveText("First");
  await expect
    .poll(() =>
      (backend.steps.get("a")?.spans as { span: string }[] | undefined)?.map((s) => s.span).sort(),
    )
    .toEqual(["BOLD", "HIGHLIGHT"]);
});

test("undo and redo go through the editor's history", async ({ page }) => {
  await open(page, twoLines());

  await block(page, "First").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" line");
  await page.keyboard.press("Enter");
  await page.keyboard.type("new");
  await expect(block(page, "new")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(block(page, "new")).toHaveCount(0);
  // Two steps back (the typing, then the line), so two steps forward.
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(block(page, "new")).toBeVisible();
  await expect(block(page, "First line")).toBeVisible();
});

test("pasted text becomes blocks, and a pasted address a link card", async ({ page }) => {
  const backend = twoLines();
  await open(page, backend);

  await block(page, "Second").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await paste(page, { "text/plain": "# Big\n- one\n[] two" });
  await expect(page.getByRole("textbox", { name: "Heading 1" })).toHaveText("Big");
  await expect(page.getByRole("checkbox", { name: "Done: two" })).toBeVisible();

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await paste(page, { "text/plain": "https://writeopia.io/blog" });
  await expect(page.getByRole("link", { name: /writeopia\.io/ })).toBeVisible();
  await expect(page.getByText("A page about things")).toBeVisible();
  await expect
    .poll(() => backend.ordered().some((each) => each.url === "https://writeopia.io/blog"))
    .toBe(true);
});

test("a pasted picture is uploaded and saved as an image block", async ({ page }) => {
  const backend = twoLines();
  await open(page, backend);

  await block(page, "Second").click();
  await paste(page, {}, [{ name: "photo.png", type: "image/png" }]);
  await expect(page.locator("figure img")).toHaveAttribute("src", "https://images.example/1.png");
  await expect
    .poll(() => backend.ordered().map((each) => each.url ?? null))
    .toContain("https://images.example/1.png");
});

test("blocks are selected with Shift+arrows, copied, and deleted", async ({ page }) => {
  const backend = twoLines();
  await open(page, backend);

  await block(page, "Second").click();
  await page.keyboard.press("Shift+ArrowUp");
  await page.keyboard.press("Shift+ArrowUp");
  await expect(page.locator("[data-block-id][data-selected]")).toHaveCount(2);
  await page.keyboard.press("Backspace");
  await expect.poll(() => backend.texts()).toEqual(["Notes"]);
});

test("a block is moved by dragging its handle", async ({ page }) => {
  const backend = twoLines();
  await open(page, backend);

  const second = page.locator('[data-block-id="b"]');
  await second.hover();
  await second
    .getByRole("button", { name: /Drag to move/ })
    .dragTo(page.locator('[data-block-id="a"]'), {
      targetPosition: { x: 40, y: 2 },
    });
  await expect.poll(() => backend.texts()).toEqual(["Notes", "Second", "First"]);
});

test("finds text in the document", async ({ page }) => {
  await open(page, twoLines());

  await block(page, "First").click();
  await page.keyboard.press("ControlOrMeta+f");
  await page.getByRole("searchbox", { name: "Find in document" }).fill("s");
  await expect(page.getByText("1 of 3")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByText("2 of 3")).toBeVisible();
  await expect(page.locator("mark.wr-match-active")).toHaveCount(1);
});

test("text composed with an input method arrives whole", async ({ page }) => {
  const backend = twoLines();
  await open(page, backend);

  await block(page, "First").click();
  await page.keyboard.press("End");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.imeSetComposition", { text: "に", selectionStart: 1, selectionEnd: 1 });
  await cdp.send("Input.imeSetComposition", { text: "にほ", selectionStart: 2, selectionEnd: 2 });
  await cdp.send("Input.insertText", { text: "日本" });
  await expect(block(page, "First日本")).toBeVisible();
  await expect.poll(() => backend.steps.get("a")?.text).toBe("First日本");
});

test("a locked document is read only", async ({ page }) => {
  const backend = twoLines();
  backend.locked = true;
  await open(page, backend);

  await expect(page.getByText("Locked")).toBeVisible();
  await expect(block(page, "First")).toHaveAttribute("contenteditable", "false");
});

test("Backspace at the start of a box line keeps the caret in it", async ({ page }) => {
  const backend = new FakeBackend(DOCUMENT_ID, [
    titleStep("Notes"),
    step("a", "0001000001", { text: "First" }),
    step("b", "0001000002", { text: "Boxed", tags: [{ tag: "HIGH_LIGHT_BLOCK", position: 0 }] }),
  ]);
  await open(page, backend);

  await block(page, "Boxed").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("Z");
  await expect.poll(() => backend.texts()).toEqual(["Notes", "First", "ZBoxed"]);
  await expect.poll(() => backend.steps.get("b")?.tags).toEqual([]);
});

test("a line brought back by undo after its deletion was saved is saved again", async ({
  page,
}) => {
  const backend = twoLines();
  await open(page, backend);

  await block(page, "First").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Delete");
  await expect.poll(() => backend.texts()).toEqual(["Notes", "FirstSecond"]);
  await saved(page);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => backend.texts()).toEqual(["Notes", "First", "Second"]);
  await page.reload();
  await expect(block(page, "Second")).toBeVisible();
});

test("a header color is saved in the title and kept after a reload", async ({ page }) => {
  const backend = new FakeBackend(DOCUMENT_ID, [titleStep("Trip")]);
  await open(page, backend);

  await page.getByRole("textbox", { name: "Title" }).hover();
  await page.getByRole("button", { name: "Edit header" }).click();
  await page
    .getByRole("dialog", { name: "Header" })
    .getByRole("radio", { name: "#0000ff" })
    .click();
  await page.getByRole("button", { name: "Done" }).click();
  await saved(page);
  expect(backend.steps.get("title")?.decoration).toEqual({ backgroundColor: -16776961 });

  await page.reload();
  await expect(page.getByTestId("document-header")).toHaveAttribute("data-header", "color");
});

test("locking from the document actions makes the document read only", async ({ page }) => {
  const backend = new FakeBackend(DOCUMENT_ID, [titleStep("Trip")]);
  await open(page, backend);

  await page.getByRole("button", { name: "Document actions" }).click();
  await page.getByRole("menuitem", { name: "Lock document" }).click();
  await expect(page.getByText("Locked")).toBeVisible();
  await expect.poll(() => backend.locked).toBe(true);

  await page.reload();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveAttribute(
    "contenteditable",
    "false",
  );
});

test("an answer of the AI is saved only once kept, and stays after a reload", async ({ page }) => {
  const backend = twoLines();
  backend.aiAvailable = true;
  backend.aiAnswer = "- Bread\n- Cheese";
  await open(page, backend);

  await block(page, "Second").click();
  await page.keyboard.press("ControlOrMeta+j");
  await page.getByRole("textbox", { name: "Ask AI…" }).fill("add two foods");
  await page.keyboard.press("Enter");

  await expect(page.getByText("Keep the AI's answer?")).toBeVisible();
  await expect(block(page, "Cheese")).toBeVisible();
  await saved(page);
  expect(backend.texts()).toEqual(["Notes", "First", "Second"]);

  await page.getByRole("button", { name: "Keep" }).click();
  await expect.poll(() => backend.texts()).toEqual(["Notes", "First", "Second", "Bread", "Cheese"]);

  await page.reload();
  await expect(block(page, "Cheese")).toBeVisible();
});
