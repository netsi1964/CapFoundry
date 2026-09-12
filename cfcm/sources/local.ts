/**
 * The reserved Local.* source (MVP section 15, PRD-FEAT-003.4).
 *
 * Built into CFCM rather than configurable: Local.* means "this machine only",
 * so allowing it to be pointed at a shared path would make the name a lie.
 */

import { FilesystemSource } from "./filesystem.ts";
import { paths } from "../util/paths.ts";

export const LOCAL_NAMESPACE = "Local";

export function createLocalSource(root: string = paths.local()): FilesystemSource {
  return new FilesystemSource("local", root, "local", LOCAL_NAMESPACE, true);
}
