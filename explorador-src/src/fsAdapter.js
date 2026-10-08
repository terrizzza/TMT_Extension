// Adaptador entre la File System Access API de Chrome y el modelo plano de react-file-manager.
// Cada entrada: { _id, name, isDirectory, path, size, updatedAt, handle, parentHandle }

const DB_NAME = "explorador-archivos";
const STORE = "handles";
const ROOT_KEY = "root";

const openDB = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const saveRootHandle = async (handle) => {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, ROOT_KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
};

export const loadRootHandle = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE).objectStore(STORE).get(ROOT_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
};

export const pickRootDirectory = async () => {
  const handle = await window.showDirectoryPicker({ mode: "readwrite", startIn: "downloads" });
  await saveRootHandle(handle);
  return handle;
};

// Devuelve true si tenemos permiso de lectura/escritura (pidiéndolo si hace falta; requiere gesto del usuario)
export const ensurePermission = async (handle, request = false) => {
  const opts = { mode: "readwrite" };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  if (request && (await handle.requestPermission(opts)) === "granted") return true;
  return false;
};

const MAX_DEPTH = 6;

export const scanDirectory = async (rootHandle, showHidden) => {
  const entries = [];

  const walk = async (dirHandle, basePath, depth) => {
    for await (const handle of dirHandle.values()) {
      if (!showHidden && handle.name.startsWith(".")) continue;
      const path = `${basePath}/${handle.name}`;
      const isDirectory = handle.kind === "directory";
      let size;
      let updatedAt;
      let fileObj = null;
      if (!isDirectory) {
        try {
          const file = await handle.getFile();
          size = file.size;
          updatedAt = new Date(file.lastModified).toISOString();
          fileObj = file;
        } catch {
          continue; // archivo bloqueado o desaparecido
        }
      }
      entries.push({
        _id: path,
        name: handle.name,
        isDirectory,
        path,
        size,
        updatedAt,
        handle,
        parentHandle: dirHandle,
        fileObj,
      });
      if (isDirectory && depth < MAX_DEPTH) await walk(handle, path, depth + 1);
    }
  };

  await walk(rootHandle, "", 0);
  return entries;
};

export const getDirByPath = async (rootHandle, path) => {
  let dir = rootHandle;
  for (const part of path.split("/").filter(Boolean)) {
    dir = await dir.getDirectoryHandle(part);
  }
  return dir;
};

export const createFolder = async (rootHandle, name, parentPath) => {
  const parent = await getDirByPath(rootHandle, parentPath);
  await parent.getDirectoryHandle(name, { create: true });
};

export const removeEntries = async (items) => {
  for (const item of items) {
    await item.parentHandle.removeEntry(item.name, { recursive: true });
  }
};

const copyInto = async (srcHandle, destDir, newName) => {
  if (srcHandle.kind === "file") {
    const file = await srcHandle.getFile();
    const dest = await destDir.getFileHandle(newName, { create: true });
    const writable = await dest.createWritable();
    await writable.write(file);
    await writable.close();
  } else {
    const dest = await destDir.getDirectoryHandle(newName, { create: true });
    for await (const child of srcHandle.values()) {
      await copyInto(child, dest, child.name);
    }
  }
};

// Evita sobrescribir: "a.txt" -> "a (copia).txt", "a (copia 2).txt"...
const uniqueName = async (destDir, name) => {
  const exists = async (n) => {
    try {
      await destDir.getFileHandle(n);
      return true;
    } catch {
      try {
        await destDir.getDirectoryHandle(n);
        return true;
      } catch {
        return false;
      }
    }
  };
  if (!(await exists(name))) return name;
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 1; ; i++) {
    const candidate = `${base} (copia${i > 1 ? " " + i : ""})${ext}`;
    if (!(await exists(candidate))) return candidate;
  }
};

// Mueve o copia al directorio destino. Si move() no está disponible, copia y borra.
export const transferEntries = async (rootHandle, items, destPath, operation) => {
  const destDir = await getDirByPath(rootHandle, destPath);
  for (const item of items) {
    // No permitir meter una carpeta dentro de sí misma
    if (item.isDirectory && (destPath === item.path || destPath.startsWith(item.path + "/"))) continue;
    const name = await uniqueName(destDir, item.name);
    if (operation === "move") {
      if (item.parentHandle && (await item.parentHandle.isSameEntry(destDir))) continue;
      try {
        await item.handle.move(destDir, name);
        continue;
      } catch {
        // sin soporte de move() para esta carpeta: copia + borrado
      }
      await copyInto(item.handle, destDir, name);
      await item.parentHandle.removeEntry(item.name, { recursive: true });
    } else {
      await copyInto(item.handle, destDir, name);
    }
  }
};

export const renameEntry = async (item, newName) => {
  try {
    await item.handle.move(newName);
    return;
  } catch {
    // fallback: copia + borrado en el mismo directorio
  }
  await copyInto(item.handle, item.parentHandle, newName);
  await item.parentHandle.removeEntry(item.name, { recursive: true });
};

export const saveFileToDir = async (destDir, file, nameOverride = null) => {
  const filename = nameOverride || file.name || "archivo_descargado";
  const name = await uniqueName(destDir, filename);
  const fileHandle = await destDir.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
  return name;
};

export const saveDirectoryEntryToDir = async (destDir, dirEntry) => {
  const name = await uniqueName(destDir, dirEntry.name);
  const targetSubDir = await destDir.getDirectoryHandle(name, { create: true });
  const reader = dirEntry.createReader();
  const readEntries = () => new Promise((resolve) => reader.readEntries(resolve));
  let entries;
  do {
    entries = await readEntries();
    if (!entries) break;
    for (const entry of entries) {
      if (entry.isFile) {
        const file = await new Promise((resolve) => entry.file(resolve));
        if (file) await saveFileToDir(targetSubDir, file);
      } else if (entry.isDirectory) {
        await saveDirectoryEntryToDir(targetSubDir, entry);
      }
    }
  } while (entries && entries.length > 0);
  return name;
};

export const importFromDataTransfer = async (rootHandle, destPath, dataTransfer) => {
  const destDir = await getDirByPath(rootHandle, destPath);
  const savedFiles = [];

  // 1. Intentar leer items de Chrome con FileSystemEntry o getAsFile
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  let handledWithItems = false;

  if (items.length > 0) {
    for (const item of items) {
      if (item.kind === "file") {
        if (typeof item.webkitGetAsEntry === "function") {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            if (entry.isFile) {
              const file = await new Promise((resolve) => entry.file(resolve));
              if (file) {
                const name = await saveFileToDir(destDir, file);
                savedFiles.push(name);
                handledWithItems = true;
              }
            } else if (entry.isDirectory) {
              const name = await saveDirectoryEntryToDir(destDir, entry);
              savedFiles.push(name);
              handledWithItems = true;
            }
            continue;
          }
        }

        const file = item.getAsFile();
        if (file) {
          const name = await saveFileToDir(destDir, file);
          savedFiles.push(name);
          handledWithItems = true;
        }
      }
    }
  }

  // 2. Si no se procesó con items, procesar dataTransfer.files
  if (!handledWithItems && dataTransfer.files && dataTransfer.files.length > 0) {
    for (const file of Array.from(dataTransfer.files)) {
      const name = await saveFileToDir(destDir, file);
      savedFiles.push(name);
    }
  }

  // 3. Si no hay archivos en dataTransfer pero hay una URL (arrastrar imagen desde web)
  if (savedFiles.length === 0) {
    let url = dataTransfer.getData("text/uri-list") || dataTransfer.getData("URL");
    if (!url) {
      const html = dataTransfer.getData("text/html");
      if (html) {
        const match = html.match(/src=["'](.*?)["']/);
        if (match) url = match[1];
      }
    }
    if (url && (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:") || url.startsWith("blob:"))) {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        let filename = "";
        try {
          const parsed = new URL(url);
          filename = parsed.pathname.split("/").filter(Boolean).pop();
        } catch {}
        if (!filename || !filename.includes(".")) {
          const ext = (blob.type.split("/")[1] || "png").replace("+xml", "");
          filename = `descarga_${Date.now()}.${ext}`;
        }
        const name = await saveFileToDir(destDir, blob, filename);
        savedFiles.push(name);
      } catch (err) {
        console.warn("[TMT Explorer] Error descargando URL arrastrada:", err);
      }
    }
  }

  return savedFiles;
};
