import { useCallback, useEffect, useRef, useState } from "react";
import {
  MdCloudDownload,
  MdDeleteSweep,
  MdFolderOpen,
  MdOutlineDelete,
  MdSettings,
  MdUndo,
  MdVisibility,
  MdVisibilityOff,
} from "react-icons/md";
import { BsFolderPlus } from "react-icons/bs";
import "./App.scss";
import FileManager from "./FileManager/FileManager";
import {
  createFolder,
  ensurePermission,
  getDirByPath,
  importFromDataTransfer,
  loadRootHandle,
  pickRootDirectory,
  removeEntries,
  renameEntry,
  scanDirectory,
  transferEntries,
} from "./fsAdapter";

const imageExt = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"];
const videoExt = ["mp4", "webm", "mov"];
const audioExt = ["mp3", "wav", "m4a", "ogg"];
const frameExt = ["pdf", "txt", "log", "json", "md", "csv"];

const extOf = (name) => name.split(".").pop().toLowerCase();

function Preview({ file }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    setUrl(null);
    if (file && !file.isDirectory) {
      file.handle.getFile().then((f) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(f);
        setUrl(objectUrl);
      });
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  if (!file) return <div className="preview-empty">Selecciona un archivo</div>;
  if (file.isDirectory) return <div className="preview-empty">{file.name}</div>;
  const ext = extOf(file.name);
  let body = <div className="preview-empty">Sin vista previa</div>;
  if (url) {
    if (imageExt.includes(ext)) body = <img src={url} alt={file.name} />;
    else if (videoExt.includes(ext)) body = <video src={url} controls />;
    else if (audioExt.includes(ext)) body = <audio src={url} controls />;
    else if (frameExt.includes(ext)) body = <iframe src={url} title={file.name} />;
  }
  return (
    <div className="preview-content">
      <div className="preview-name">{file.name}</div>
      {body}
    </div>
  );
}

function App() {
  const [root, setRoot] = useState(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [currentPath, setCurrentPath] = useState("");
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [undoStack, setUndoStack] = useState([]);
  const [isDraggingExternal, setIsDraggingExternal] = useState(false);

  const actionTriggerRef = useRef(null);
  const settingsMenuRef = useRef(null);
  const dragCounterRef = useRef(0);

  // Evitar navegación accidental al soltar fuera de la zona en Chrome
  useEffect(() => {
    const preventWindowNav = (e) => {
      e.preventDefault();
    };
    window.addEventListener("dragover", preventWindowNav);
    window.addEventListener("drop", preventWindowNav);
    return () => {
      window.removeEventListener("dragover", preventWindowNav);
      window.removeEventListener("drop", preventWindowNav);
    };
  }, []);

  const refresh = useCallback(
    async (handle = root, hidden = showHidden) => {
      if (!handle) return;
      setIsLoading(true);
      try {
        setFiles(await scanDirectory(handle, hidden));
      } catch (e) {
        setError(e.message);
      }
      setIsLoading(false);
    },
    [root, showHidden]
  );

  // Al arrancar, fija el título de la pestaña y recupera la carpeta guardada
  useEffect(() => {
    document.title = "Archivos";
    loadRootHandle().then(async (handle) => {
      if (!handle) return;
      setRoot(handle);
      if (await ensurePermission(handle)) refresh(handle);
      else setNeedsPermission(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-actualizar al recuperar el foco o hacer clic en la pestaña
  useEffect(() => {
    const handleFocusRefresh = () => {
      if (root && !needsPermission) {
        refresh();
      }
    };

    window.addEventListener("focus", handleFocusRefresh);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleFocusRefresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    let messageListener;
    if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
      messageListener = (msg) => {
        if (msg.action === "refreshExplorer") {
          handleFocusRefresh();
        }
      };
      chrome.runtime.onMessage.addListener(messageListener);
    }

    return () => {
      window.removeEventListener("focus", handleFocusRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (messageListener && typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
        chrome.runtime.onMessage.removeListener(messageListener);
      }
    };
  }, [root, needsPermission, refresh]);

  // Cierra menú de ajustes al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target)) {
        setShowSettings(false);
      }
    };
    if (showSettings) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSettings]);

  const run = async (fn) => {
    setError("");
    setIsLoading(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
    await refresh();
  };

  const pushUndo = (action) => {
    setUndoStack((prev) => [...prev.slice(-20), action]);
  };

  const undoLastAction = async () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    await run(async () => {
      await last.restore();
    });
  };

  // Atajo global Ctrl+Z / Cmd+Z para deshacer
  useEffect(() => {
    const handleUndoShortcut = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
        e.preventDefault();
        undoLastAction();
      }
    };
    window.addEventListener("keydown", handleUndoShortcut);
    return () => window.removeEventListener("keydown", handleUndoShortcut);
  }, [undoStack]);

  const chooseFolder = async () => {
    try {
      const handle = await pickRootDirectory();
      setRoot(handle);
      setNeedsPermission(false);
      setCurrentPath("");
      setSelected([]);
      await refresh(handle);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    }
  };

  const grantPermission = async () => {
    if (await ensurePermission(root, true)) {
      setNeedsPermission(false);
      refresh();
    }
  };

  const backupItems = async (items) => {
    const backup = [];
    for (const item of items) {
      if (!item.isDirectory) {
        try {
          const fileObj = item.fileObj || (await item.handle.getFile());
          backup.push({
            name: item.name,
            parentHandle: item.parentHandle,
            fileObj,
          });
        } catch {
          // continuar con el resto
        }
      }
    }
    return backup;
  };

  const restoreBackup = async (backup) => {
    for (const item of backup) {
      try {
        const handle = await item.parentHandle.getFileHandle(item.name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(item.fileObj);
        await writable.close();
      } catch {
        // continuar con el resto
      }
    }
  };

  // Borrar sin confirmación
  const deleteSelected = async (itemsToDelete = selected) => {
    if (!itemsToDelete || itemsToDelete.length === 0) return;
    const targets = [...itemsToDelete];
    setSelected([]);
    const backup = await backupItems(targets);
    await run(() => removeEntries(targets));
    if (backup.length > 0) {
      pushUndo({
        type: "delete",
        description: `Borrar ${backup.length} archivo(s)`,
        restore: () => restoreBackup(backup),
      });
    }
  };

  // Vaciar los archivos de la carpeta actual (sin tocar subcarpetas y sin confirmación)
  const emptyFolder = async () => {
    const toDelete = files.filter((f) => !f.isDirectory && f.path === `${currentPath}/${f.name}`);
    if (toDelete.length === 0) return;
    setSelected([]);
    const backup = await backupItems(toDelete);
    await run(() => removeEntries(toDelete));
    if (backup.length > 0) {
      pushUndo({
        type: "emptyFolder",
        description: `Vaciar carpeta (${backup.length} archivos)`,
        restore: () => restoreBackup(backup),
      });
    }
  };

  const handleCreateFolderBtn = () => {
    if (actionTriggerRef.current) {
      actionTriggerRef.current.show("createFolder");
    }
  };

  const currentFolderFilesCount = files.filter(
    (f) => !f.isDirectory && f.path === `${currentPath}/${f.name}`
  ).length;

  const itemCount = files.filter((f) => f.path === `${currentPath}/${f.name}`).length;

  const toggleHidden = () => {
    const next = !showHidden;
    setShowHidden(next);
    refresh(root, next);
  };

  const handleDropExternal = async (destPath, dataTransfer) => {
    if (!root || needsPermission) return;
    await run(async () => {
      const savedNames = await importFromDataTransfer(root, destPath, dataTransfer);
      if (savedNames.length > 0) {
        pushUndo({
          type: "import",
          description: `Copiar ${savedNames.length} archivo(s)`,
          restore: async () => {
            const destDir = await getDirByPath(root, destPath);
            for (const name of savedNames) {
              try {
                await destDir.removeEntry(name, { recursive: true });
              } catch {}
            }
          },
        });
      }
    });
  };

  const handleContainerDragEnter = (e) => {
    if (e.dataTransfer.types && (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes("text/uri-list"))) {
      e.preventDefault();
      dragCounterRef.current++;
      if (dragCounterRef.current === 1) {
        setIsDraggingExternal(true);
      }
    }
  };

  const handleContainerDragOver = (e) => {
    if (e.dataTransfer.types && (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes("text/uri-list"))) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleContainerDragLeave = (e) => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingExternal(false);
    }
  };

  const handleContainerDrop = async (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingExternal(false);

    // Si es un arrastre interno entre carpetas dentro de la misma app, el contexto de FileItem/FileManager ya lo maneja
    if (e.dataTransfer.types.includes("application/x-tmt-drag")) return;

    await handleDropExternal(currentPath, e.dataTransfer);
  };

  return (
    <div className="app">
      <div className="topbar">
        {/* 4 Botones grandes principales */}
        <div className="topbar-main-actions">
          <button
            className="action-btn action-btn-undo"
            onClick={undoLastAction}
            disabled={undoStack.length === 0}
            title={
              undoStack.length > 0
                ? `Deshacer: ${undoStack[undoStack.length - 1].description} (Ctrl+Z)`
                : "Deshacer (Ctrl+Z)"
            }
          >
            <MdUndo size={20} />
            <span>Deshacer</span>
          </button>

          <button
            className="action-btn action-btn-new-folder"
            onClick={handleCreateFolderBtn}
            disabled={!root || needsPermission}
            title="Crear una nueva carpeta"
          >
            <BsFolderPlus size={19} />
            <span>Nueva Carpeta</span>
          </button>

          <button
            className="action-btn action-btn-empty"
            onClick={emptyFolder}
            disabled={!root || needsPermission || currentFolderFilesCount === 0}
            title="Eliminar todos los archivos de esta carpeta (deshacible)"
          >
            <MdDeleteSweep size={20} />
            <span>Vaciar carpeta</span>
          </button>

          <button
            className="action-btn action-btn-delete"
            onClick={() => deleteSelected(selected)}
            disabled={!root || needsPermission || selected.length === 0}
            title="Borrar elementos seleccionados (Supr, deshacible)"
          >
            <MdOutlineDelete size={20} />
            <span>Borrar</span>
          </button>
        </div>

        {error && <span className="error">{error}</span>}

        {/* Botón de ajustes a la derecha para esconder Elegir carpeta y Elementos ocultos */}
        <div className="topbar-right-actions">
          <div className="settings-wrapper" ref={settingsMenuRef}>
            <button
              className={`settings-btn ${showSettings ? "active" : ""}`}
              onClick={() => setShowSettings((prev) => !prev)}
              title="Ajustes y opciones"
            >
              <MdSettings size={20} />
            </button>

            {showSettings && (
              <div className="settings-menu">
                <button
                  className="settings-menu-item"
                  onClick={() => {
                    setShowSettings(false);
                    chooseFolder();
                  }}
                >
                  <MdFolderOpen size={18} />
                  <span>Elegir carpeta...</span>
                </button>
                <button
                  className={`settings-menu-item ${showHidden ? "active" : ""}`}
                  disabled={!root}
                  onClick={() => {
                    setShowSettings(false);
                    toggleHidden();
                  }}
                >
                  {showHidden ? <MdVisibility size={18} /> : <MdVisibilityOff size={18} />}
                  <span>{showHidden ? "Ocultar elementos ocultos" : "Mostrar elementos ocultos"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {!root && <div className="empty">Elige una carpeta para empezar (por ejemplo, Descargas).</div>}
      {root && needsPermission && (
        <div className="empty">
          <button onClick={grantPermission}>Conceder acceso a «{root.name}»</button>
        </div>
      )}

      {root && !needsPermission && (
        <div className="main">
          <div
            className="file-manager-container"
            onDragEnter={handleContainerDragEnter}
            onDragOver={handleContainerDragOver}
            onDragLeave={handleContainerDragLeave}
            onDrop={handleContainerDrop}
          >
            {isDraggingExternal && (
              <div className="external-drop-overlay">
                <div className="external-drop-content">
                  <MdCloudDownload size={48} />
                  <h3>Copiar archivos aquí</h3>
                  <p>
                    Se guardarán en: <strong>{currentPath ? currentPath.split("/").pop() : root?.name}</strong>
                  </p>
                </div>
              </div>
            )}
            <FileManager
              files={files}
              isLoading={isLoading}
              actionTriggerRef={actionTriggerRef}
              onDropExternal={handleDropExternal}
              onCreateFolder={(name, parent) => {
                const parentPath = parent?.path ?? currentPath;
                run(async () => {
                  await createFolder(root, name, parentPath);
                  pushUndo({
                    type: "createFolder",
                    description: `Crear carpeta «${name}»`,
                    restore: async () => {
                      const parentDir = await getDirByPath(root, parentPath);
                      await parentDir.removeEntry(name, { recursive: true });
                    },
                  });
                });
              }}
              onRename={(file, newName) => {
                const oldName = file.name;
                run(async () => {
                  await renameEntry(file, newName);
                  pushUndo({
                    type: "rename",
                    description: `Renombrar «${newName}»`,
                    restore: async () => {
                      const parentDir = file.parentHandle;
                      const currentEntry = file.isDirectory
                        ? await parentDir.getDirectoryHandle(newName)
                        : await parentDir.getFileHandle(newName);
                      await renameEntry({ ...file, name: newName, handle: currentEntry }, oldName);
                    },
                  });
                });
              }}
              onDelete={(items) => deleteSelected(items)}
              onPaste={(items, dest, op) =>
                run(() => transferEntries(root, items, dest?.path ?? "", op === "copy" ? "copy" : "move"))
              }
              onRefresh={() => refresh()}
              onSelectionChange={setSelected}
              onFolderChange={setCurrentPath}
              onError={(e) => setError(String(e?.message ?? e))}
              layout="grid"
              language="es-ES"
              primaryColor="#0067c0"
              fontFamily="Segoe UI, system-ui, sans-serif"
              enableFilePreview={false}
              permissions={{ upload: false, download: false }}
              height="100%"
              width="100%"
              initialPath={currentPath}
            />
          </div>
          <aside className="preview-pane">
            <Preview file={selected.length === 1 ? selected[0] : null} />
          </aside>
        </div>
      )}
      {root && !needsPermission && (
        <div className="statusbar">
          <span>{itemCount} {itemCount === 1 ? "elemento" : "elementos"}</span>
          {selected.length > 0 && (
            <span>
              {selected.length} {selected.length === 1 ? "elemento seleccionado" : "elementos seleccionados"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
