import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockStormsQuery = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockRemove = vi.fn();
const mockCreateLink = vi.fn();
const mockDeleteLink = vi.fn();
const mockMoveSubtree = vi.fn();
vi.mock("@/hooks/use-storms", () => ({
  useStorms: () => mockStormsQuery(),
  useCreateStorm: () => mockCreate(),
  useUpdateStorm: () => mockUpdate(),
  useDeleteStorm: () => mockRemove(),
  useCreateLink: () => mockCreateLink(),
  useDeleteLink: () => mockDeleteLink(),
  useMoveSubtree: () => mockMoveSubtree(),
}));

import StormPage from "@/app/(dashboard)/storm/page";

type StormCard = { id: string; name: string; positionX: number; positionY: number; isArchived?: boolean };
type StormLink = { id: string; sourceId: string; targetId: string; sourceCorner: number; targetCorner: number };

function makeStormMutate() {
  return {
    mutate: vi.fn((_name: string, opts?: { onSuccess?: (d: any) => void }) => {
      if (opts?.onSuccess) opts.onSuccess({ storm: { id: "new-id" } });
    }),
  };
}

function makeSimpleMutate() {
  return { mutate: vi.fn() };
}

function stubCanvas() {
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: 1000, height: 800, left: 0, top: 0, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
  (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <StormPage />
    </MemoryRouter>
  );
}

const STORM_A: StormCard = { id: "a", name: "Alpha", positionX: 100, positionY: 100 };
const STORM_B: StormCard = { id: "b", name: "Beta", positionX: 400, positionY: 200 };
const STORM_C_ARCHIVED: StormCard = { id: "c", name: "Archived", positionX: 0, positionY: 0, isArchived: true };
const LINK_AB: StormLink = { id: "L1", sourceId: "a", targetId: "b", sourceCorner: 0, targetCorner: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  stubCanvas();
  mockCreate.mockReturnValue(makeStormMutate());
  mockUpdate.mockReturnValue(makeSimpleMutate());
  mockRemove.mockReturnValue(makeSimpleMutate());
  mockCreateLink.mockReturnValue(makeSimpleMutate());
  mockDeleteLink.mockReturnValue(makeSimpleMutate());
  mockMoveSubtree.mockReturnValue(makeSimpleMutate());
  mockStormsQuery.mockReturnValue({ data: { storms: [], links: [] }, isLoading: false });
});

describe("StormPage", () => {
  describe("loading state", () => {
    it("renders the loading text when useStorms reports isLoading: true", () => {
      mockStormsQuery.mockReturnValue({ data: undefined, isLoading: true });
      renderPage();
      expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    });
  });

  describe("rendering cards and links", () => {
    it("renders 2 cards and 1 link, with card name + 8 corner handles; archived storms are excluded", () => {
      mockStormsQuery.mockReturnValue({ data: { storms: [STORM_A, STORM_B, STORM_C_ARCHIVED], links: [LINK_AB] }, isLoading: false });
      renderPage();
      const cards = screen.getAllByTestId("card");
      expect(cards).toHaveLength(2);
      const links = screen.getAllByTestId("link-line");
      expect(links).toHaveLength(1);
      const names = screen.getAllByTestId("card-name");
      const allNames = names.map((n) => n.textContent);
      expect(allNames).toEqual(expect.arrayContaining(["Alpha", "Beta"]));
      expect(allNames).not.toContain("Archived");
      const corners = screen.getAllByTestId("corner");
      expect(corners).toHaveLength(8);
    });
  });

  describe("fit view button", () => {
    it("does not throw with empty data", () => {
      mockStormsQuery.mockReturnValue({ data: { storms: [], links: [] }, isLoading: false });
      renderPage();
      const btn = screen.getByTestId("fit-view-button");
      expect(() => fireEvent.click(btn)).not.toThrow();
    });

    it("does not throw with storms present", () => {
      mockStormsQuery.mockReturnValue({ data: { storms: [STORM_A, STORM_B], links: [LINK_AB] }, isLoading: false });
      renderPage();
      const btn = screen.getByTestId("fit-view-button");
      expect(() => fireEvent.click(btn)).not.toThrow();
    });
  });

  describe("create modal", () => {
    it("opens the modal and shows an empty input by default", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByTestId("new-storm-button"));
      const modal = screen.getByTestId("new-storm-modal");
      const input = within(modal).getByTestId("new-storm-input") as HTMLInputElement;
      expect(modal).toBeInTheDocument();
      expect(input.value).toBe("");
    });

    it("typing a name and pressing Enter calls useCreateStorm and navigates to the note route", async () => {
      const user = userEvent.setup();
      const mutateFn = vi.fn((_name: string, opts?: { onSuccess?: (d: any) => void }) => {
        if (opts?.onSuccess) opts.onSuccess({ storm: { id: "new-id" } });
      });
      mockCreate.mockReturnValue({ mutate: mutateFn });
      renderPage();
      await user.click(screen.getByTestId("new-storm-button"));
      const input = screen.getByTestId("new-storm-input");
      await user.type(input, "My idea");
      await user.keyboard("{Enter}");
      // submitNew now sends a payload { name, positionX, positionY } (centred
      // in the viewport) and navigates to the note route on success.
      expect(mutateFn).toHaveBeenCalledWith(
        expect.objectContaining({ name: "My idea" }),
        expect.objectContaining({ onSuccess: expect.any(Function) })
      );
      expect(mockNavigate).toHaveBeenCalled();
      const navArg = mockNavigate.mock.calls[0][0] as string;
      expect(navArg).toMatch(/\/new-id\/note$/);
    });

    it("pressing Escape closes the modal", async () => {
      const user = userEvent.setup();
      renderPage();
      await user.click(screen.getByTestId("new-storm-button"));
      expect(screen.getByTestId("new-storm-modal")).toBeInTheDocument();
      await user.keyboard("{Escape}");
      expect(screen.queryByTestId("new-storm-modal")).not.toBeInTheDocument();
    });

    it("empty name does not call create", async () => {
      const user = userEvent.setup();
      const mutateFn = vi.fn();
      mockCreate.mockReturnValue({ mutate: mutateFn });
      renderPage();
      await user.click(screen.getByTestId("new-storm-button"));
      const input = screen.getByTestId("new-storm-input");
      await user.type(input, "   ");
      await user.keyboard("{Enter}");
      expect(mutateFn).not.toHaveBeenCalled();
    });
  });

  describe("empty-canvas click", () => {
    it("clicking (press + release, no drag) on empty canvas does NOTHING", () => {
      mockStormsQuery.mockReturnValue({ data: { storms: [STORM_A], links: [] }, isLoading: false });
      renderPage();
      const canvas = screen.getByTestId("canvas");
      fireEvent.pointerDown(canvas, { button: 0, clientX: 5, clientY: 5 });
      fireEvent.pointerUp(canvas, { button: 0, clientX: 5, clientY: 5 });
      // Empty-space clicks must be a no-op; use the "+ New" button to create.
      expect(screen.queryByTestId("new-storm-modal")).not.toBeInTheDocument();
    });

    it("dragging the background does NOT open the create modal", () => {
      mockStormsQuery.mockReturnValue({ data: { storms: [STORM_A], links: [] }, isLoading: false });
      renderPage();
      const canvas = screen.getByTestId("canvas");
      fireEvent.pointerDown(canvas, { button: 0, clientX: 5, clientY: 5 });
      fireEvent.pointerMove(canvas, { clientX: 80, clientY: 60 });
      fireEvent.pointerUp(canvas, { button: 0, clientX: 80, clientY: 60 });
      expect(screen.queryByTestId("new-storm-modal")).not.toBeInTheDocument();
    });
  });

  describe("rename", () => {
    it("clicking rename shows the rename-input with the current name", async () => {
      const user = userEvent.setup();
      mockStormsQuery.mockReturnValue({ data: { storms: [STORM_A], links: [] }, isLoading: false });
      renderPage();
      const card = screen.getByTestId("card");
      const renameBtn = within(card).getByRole("button", { name: /rename/i });
      await user.click(renameBtn);
      const input = within(card).getByTestId("rename-input") as HTMLInputElement;
      expect(input).toBeInTheDocument();
      expect(input.value).toBe("Alpha");
    });

    it("typing a new name and pressing Enter calls useUpdateStorm with the patch", async () => {
      const user = userEvent.setup();
      const mutateFn = vi.fn();
      mockUpdate.mockReturnValue({ mutate: mutateFn });
      mockStormsQuery.mockReturnValue({ data: { storms: [STORM_A], links: [] }, isLoading: false });
      renderPage();
      const card = screen.getByTestId("card");
      await user.click(within(card).getByRole("button", { name: /rename/i }));
      const input = within(card).getByTestId("rename-input");
      await user.clear(input);
      await user.type(input, "Alpha Two");
      await user.keyboard("{Enter}");
      expect(mutateFn).toHaveBeenCalledWith({ id: "a", patch: { name: "Alpha Two" } });
    });

    it("pressing Escape cancels rename without calling update", async () => {
      const user = userEvent.setup();
      const mutateFn = vi.fn();
      mockUpdate.mockReturnValue({ mutate: mutateFn });
      mockStormsQuery.mockReturnValue({ data: { storms: [STORM_A], links: [] }, isLoading: false });
      renderPage();
      const card = screen.getByTestId("card");
      await user.click(within(card).getByRole("button", { name: /rename/i }));
      const input = within(card).getByTestId("rename-input");
      await user.clear(input);
      await user.type(input, "Changed");
      await user.keyboard("{Escape}");
      expect(mutateFn).not.toHaveBeenCalled();
    });

    it("empty trimmed name does not call update", async () => {
      const user = userEvent.setup();
      const mutateFn = vi.fn();
      mockUpdate.mockReturnValue({ mutate: mutateFn });
      mockStormsQuery.mockReturnValue({ data: { storms: [STORM_A], links: [] }, isLoading: false });
      renderPage();
      const card = screen.getByTestId("card");
      await user.click(within(card).getByRole("button", { name: /rename/i }));
      const input = within(card).getByTestId("rename-input");
      await user.clear(input);
      await user.type(input, "   ");
      await user.keyboard("{Enter}");
      expect(mutateFn).not.toHaveBeenCalled();
    });
  });

  describe("delete with confirmation", () => {
    it("calls useDeleteStorm when window.confirm returns true", async () => {
      const user = userEvent.setup();
      const mutateFn = vi.fn();
      mockRemove.mockReturnValue({ mutate: mutateFn });
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      mockStormsQuery.mockReturnValue({ data: { storms: [STORM_A], links: [] }, isLoading: false });
      renderPage();
      const card = screen.getByTestId("card");
      await user.click(within(card).getByTestId("delete-card-button"));
      expect(confirmSpy).toHaveBeenCalled();
      expect(mutateFn).toHaveBeenCalledWith("a");
      confirmSpy.mockRestore();
    });

    it("does not call useDeleteStorm when window.confirm returns false", async () => {
      const user = userEvent.setup();
      const mutateFn = vi.fn();
      mockRemove.mockReturnValue({ mutate: mutateFn });
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      mockStormsQuery.mockReturnValue({ data: { storms: [STORM_A], links: [] }, isLoading: false });
      renderPage();
      const card = screen.getByTestId("card");
      await user.click(within(card).getByTestId("delete-card-button"));
      expect(confirmSpy).toHaveBeenCalled();
      expect(mutateFn).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });
  });

  describe("link caps", () => {
    it("a corner with 3 links still renders the corner (no throw) and uses muted classes", () => {
      const capLinks: StormLink[] = [
        { id: "l1", sourceId: "a", targetId: "b", sourceCorner: 0, targetCorner: 2 },
        { id: "l2", sourceId: "a", targetId: "b", sourceCorner: 0, targetCorner: 3 },
        { id: "l3", sourceId: "a", targetId: "b", sourceCorner: 0, targetCorner: 1 },
      ];
      mockStormsQuery.mockReturnValue({ data: { storms: [STORM_A, STORM_B], links: capLinks }, isLoading: false });
      renderPage();
      const cards = screen.getAllByTestId("card");
      const corners = within(cards[0]).getAllByTestId("corner");
      expect(corners).toHaveLength(4);
      expect(corners[0].className).toMatch(/border-muted-foreground|bg-muted/);
    });
  });

  describe("link click to delete handle", () => {
    it("clicking a link selects it and the x delete handle calls useDeleteLink", async () => {
      const user = userEvent.setup();
      const mutateFn = vi.fn();
      mockDeleteLink.mockReturnValue({ mutate: mutateFn });
      mockStormsQuery.mockReturnValue({ data: { storms: [STORM_A, STORM_B], links: [LINK_AB] }, isLoading: false });
      renderPage();
      const linkGroups = screen.getAllByTestId("link-line");
      await user.click(linkGroups[0]);
      const svg = linkGroups[0].ownerSVGElement!;
      expect(svg.textContent).toContain("×");
      const textEl = svg.querySelector("text")!;
      const handleG = textEl.parentNode as SVGGElement;
      const clickEvent = new MouseEvent("click", { bubbles: true, cancelable: true });
      handleG.dispatchEvent(clickEvent);
      expect(mutateFn).toHaveBeenCalledWith({ stormId: "a", linkId: "L1" });
    });
  });
});
