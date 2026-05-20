/** Joplin Desktop `notes` table name (pinned app version assumptions — see design). */
export const NOTES_TABLE = "notes";
export const FOLDERS_TABLE = "folders";

/** Column names read by SqliteMirrorExporter */
export const NOTE_COL = {
  id: "id",
  parent_id: "parent_id",
  title: "title",
  body: "body",
  updated_time: "updated_time",
  deleted_time: "deleted_time",
};

export const FOLDER_COL = {
  id: "id",
  parent_id: "parent_id",
  title: "title",
  deleted_time: "deleted_time",
};
