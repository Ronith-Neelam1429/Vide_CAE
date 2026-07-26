import { pickCadFile } from "./cadImport";
import { useExperimentStore } from "../store/experimentStore";

export async function importDesignFromDisk(): Promise<boolean> {
  const { setImporting, setImportError, setDesign } =
    useExperimentStore.getState();

  setImporting(true);
  setImportError(null);

  try {
    const picked = await pickCadFile();
    if (!picked) {
      setImporting(false);
      return false;
    }

    setDesign({
      id: crypto.randomUUID(),
      fileName: picked.fileName,
      kind: picked.kind,
      bytes: picked.bytes,
    });
    setImporting(false);
    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not import CAD file.";
    setImportError(message);
    setImporting(false);
    return false;
  }
}
