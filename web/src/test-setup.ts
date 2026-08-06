import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// With `globals: false`, testing-library can't register its own cleanup —
// without this, containers accumulate across tests within a file.
afterEach(cleanup);

// jsdom has no layout, so it ships no scrollIntoView. Feeds that follow
// themselves (the Chronicle) call it on every render.
Element.prototype.scrollIntoView ??= () => {};
