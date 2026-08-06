import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// With `globals: false`, testing-library can't register its own cleanup —
// without this, containers accumulate across tests within a file.
afterEach(cleanup);
