import { useEffect, useRef, useState } from "react";
import { FaRegFile } from "react-icons/fa6";
import FolderIcon from "../../components/FolderIcon/FolderIcon";
import { useFileIcons } from "../../hooks/useFileIcons";
import CreateFolderAction from "../Actions/CreateFolder/CreateFolder.action";
import RenameAction from "../Actions/Rename/Rename.action";
import { getDataSize } from "../../utils/getDataSize";
import { useFileNavigation } from "../../contexts/FileNavigationContext";
import { useSelection } from "../../contexts/SelectionContext";
import { useClipBoard } from "../../contexts/ClipboardContext";
import { useLayout } from "../../contexts/LayoutContext";

const MIME_EXTENSIONS = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  pdf: "application/pdf",
  txt: "text/plain",
  json: "application/json",
  csv: "text/csv",
  zip: "application/zip",
};

const getMimeType = (filename, existingType) => {
  if (existingType && existingType !== "application/octet-stream" && existingType !== "") {
    return existingType;
  }
  const ext = (filename || "").split(".").pop()?.toLowerCase();
  return MIME_EXTENSIONS[ext] || existingType || "application/octet-stream";
};

const FileItem = ({
  index,
  file,
  onCreateFolder,
  onRename,
  enableFilePreview,
  onFileOpen,
  filesViewRef,
  selectedFileIndexes,
  triggerAction,
  handleContextMenu,
  setLastSelectedFile,
  draggable,
  formatDate,
  onDropExternal,
}) => {
  const [fileSelected, setFileSelected] = useState(false);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [nativeFile, setNativeFile] = useState(file.fileObj || null);
  const [dataUrl, setDataUrl] = useState(null);
  const [dropZoneClass, setDropZoneClass] = useState("");
  const [tooltipPosition, setTooltipPosition] = useState(null);

  const preloadDataUrl = async () => {
    if (dataUrl || file.isDirectory) return;
    let f = file.fileObj || nativeFile;
    if (!f && file.handle?.getFile) {
      try {
        f = await file.handle.getFile();
        setNativeFile(f);
      } catch {}
    }
    if (f) {
      const reader = new FileReader();
      reader.onload = () => setDataUrl(reader.result);
      reader.readAsDataURL(f);
    }
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      let f = file.fileObj || nativeFile;
      if (!f && !file.isDirectory && file.handle?.getFile) {
        try {
          f = await file.handle.getFile();
          if (active) setNativeFile(f);
        } catch {}
      }
      if (f && !file.isDirectory) {
        const reader = new FileReader();
        reader.onload = () => {
          if (active) setDataUrl(reader.result);
        };
        reader.readAsDataURL(f);
      }
    };
    load();
    return () => { active = false; };
  }, [file, nativeFile]);

  const { activeLayout } = useLayout();
  const iconSize = activeLayout === "grid" ? 64 : 20;
  const fileIcons = useFileIcons(iconSize);
  const { setCurrentPath, currentPathFiles, onFolderChange } = useFileNavigation();
  const { setSelectedFiles, selectedFiles } = useSelection();
  const { clipBoard, handleCutCopy, setClipBoard, handlePasting } = useClipBoard();

  const isFileMoving =
    clipBoard?.isMoving &&
    clipBoard.files.find((f) => f.name === file.name && f.path === file.path);

  const handleFileAccess = () => {
    onFileOpen(file);
    if (file.isDirectory) {
      setCurrentPath(file.path);
      onFolderChange?.(file.path);
      setSelectedFiles([]);
    } else {
      enableFilePreview && triggerAction.show("previewFile");
    }
  };

  const handleFileRangeSelection = (shiftKey, ctrlKey) => {
    if (selectedFileIndexes.length > 0 && shiftKey) {
      let reverseSelection = false;
      let startRange = selectedFileIndexes[0];
      let endRange = index;

      // Reverse Selection
      if (startRange >= endRange) {
        const temp = startRange;
        startRange = endRange;
        endRange = temp;
        reverseSelection = true;
      }

      const filesRange = currentPathFiles.slice(startRange, endRange + 1);
      setSelectedFiles(reverseSelection ? filesRange.reverse() : filesRange);
    } else if (selectedFileIndexes.length > 0 && ctrlKey) {
      // Remove file from selected files if it already exists on CTRL + Click, otherwise push it in selectedFiles
      setSelectedFiles((prev) => {
        const filteredFiles = prev.filter((f) => f.path !== file.path);
        if (prev.length === filteredFiles.length) {
          return [...prev, file];
        }
        return filteredFiles;
      });
    } else {
      setSelectedFiles([file]);
    }
  };

  const handleFileSelection = (e) => {
    e.stopPropagation();
    if (file.isEditing) return;

    handleFileRangeSelection(e.shiftKey, e.ctrlKey);

    const currentTime = new Date().getTime();
    if (currentTime - lastClickTime < 300) {
      handleFileAccess();
      return;
    }
    setLastClickTime(currentTime);
  };

  const handleOnKeyDown = (e) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      setSelectedFiles([file]);
      handleFileAccess();
    }
  };

  const handleItemContextMenu = (e) => {
    e.stopPropagation();
    e.preventDefault();

    if (file.isEditing) return;

    if (!fileSelected) {
      setSelectedFiles([file]);
    }

    setLastSelectedFile(file);
    handleContextMenu(e, true);
  };

  const handleDragStart = (e) => {
    // Si este archivo no está en la selección actual, seleccionarlo solo a él
    const isCurrentlySelected = selectedFiles.some((f) => f.path === file.path);
    const filesToDrag = isCurrentlySelected && selectedFiles.length > 0 ? selectedFiles : [file];

    if (!isCurrentlySelected) {
      setSelectedFiles([file]);
    }

    e.dataTransfer.effectAllowed = "copyMove";

    // 1. Preparar payload de archivos para el puente TMT
    const primaryFile = file.fileObj || nativeFile || filesToDrag.find((f) => f.fileObj)?.fileObj;
    const currentDataUrl = dataUrl;

    const payload = filesToDrag.map((f) => {
      const obj = f.fileObj || (f === file ? nativeFile : null);
      const mime = getMimeType(f.name, obj?.type || f.type);
      return {
        name: f.name,
        type: mime,
        lastModified: obj?.lastModified || (f.updatedAt ? new Date(f.updatedAt).getTime() : Date.now()),
        dataUrl: f === file && currentDataUrl ? currentDataUrl : null,
      };
    });

    // Si falta dataUrl para alguno de los archivos a arrastrar, leerlo
    filesToDrag.forEach((f, idx) => {
      const obj = f.fileObj || (f === file ? nativeFile : null);
      if (obj && !payload[idx].dataUrl) {
        const reader = new FileReader();
        reader.onload = () => {
          payload[idx].dataUrl = reader.result;
          if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
            chrome.runtime.sendMessage({ action: "tmtSetDraggingFiles", files: payload }).catch(() => {});
          }
        };
        reader.readAsDataURL(obj);
      }
    });

    // Enviar inmediatamente a background para que cualquier pestaña receptora esté preparada
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: "tmtSetDraggingFiles", files: payload }).catch(() => {});
    }

    // 2. Establecer marcadores de arrastre
    e.dataTransfer.setData("application/x-tmt-drag", "true");

    let blobUrl = null;
    if (primaryFile) {
      try {
        blobUrl = URL.createObjectURL(primaryFile);
      } catch {}
    }
    const fileUrl = blobUrl || currentDataUrl;

    // Para abrir el archivo directamente si se suelta en una nueva pestaña o barra de direcciones:
    if (fileUrl) {
      try {
        e.dataTransfer.setData("text/uri-list", fileUrl);
        e.dataTransfer.setData("URL", fileUrl);
        e.dataTransfer.setData("text/plain", fileUrl);
      } catch {}
    }

    // Compatibilidad de arrastre al escritorio en Chrome (DownloadURL)
    if (primaryFile && fileUrl) {
      try {
        const mime = getMimeType(primaryFile.name, primaryFile.type);
        e.dataTransfer.setData("DownloadURL", `${mime}:${primaryFile.name}:${fileUrl}`);
      } catch {}
    }

    // NOTA: NO fijar text/plain con el nombre plano del archivo, para evitar que Chrome
    // realice una búsqueda de Google al soltar en la barra de pestañas o en la nueva pestaña.

    // 3. Configurar imagen de arrastre visible directamente en pantalla
    if (filesToDrag.length > 1) {
      const badge = document.createElement("div");
      badge.style.position = "fixed";
      badge.style.top = `${e.clientY}px`;
      badge.style.left = `${e.clientX}px`;
      badge.style.padding = "6px 14px";
      badge.style.background = "#0067c0";
      badge.style.color = "#ffffff";
      badge.style.borderRadius = "20px";
      badge.style.fontSize = "13px";
      badge.style.fontWeight = "600";
      badge.style.boxShadow = "0 3px 10px rgba(0,0,0,0.3)";
      badge.style.zIndex = "999999";
      badge.style.pointerEvents = "none";
      badge.style.display = "flex";
      badge.style.alignItems = "center";
      badge.style.gap = "6px";
      badge.textContent = `📁 ${filesToDrag.length} archivos`;
      document.body.appendChild(badge);
      e.dataTransfer.setDragImage(badge, 20, 15);
      setTimeout(() => {
        if (badge.parentNode) badge.parentNode.removeChild(badge);
      }, 0);
    } else {
      // Para 1 archivo, usamos directamente el contenedor del archivo (e.currentTarget)
      const rect = e.currentTarget.getBoundingClientRect();
      const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const offsetY = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
      e.dataTransfer.setDragImage(e.currentTarget, offsetX, offsetY);
    }

    handleCutCopy(true);
  };

  const handleDragEnd = () => {
    setClipBoard(null);
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: "tmtClearDraggingFiles" }).catch(() => {});
    }
  };

  const handleDragEnterOver = (e) => {
    e.preventDefault();
    if (fileSelected || !file.isDirectory) {
      e.dataTransfer.dropEffect = "none";
    } else {
      setTooltipPosition({ x: e.clientX, y: e.clientY + 12 });
      e.dataTransfer.dropEffect = "copy";
      setDropZoneClass("file-drop-zone");
    }
  };

  const handleDragLeave = (e) => {
    // To stay in dragging state for the child elements of the target drop-zone
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropZoneClass((prev) => (prev ? "" : prev));
      setTooltipPosition(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (!file.isDirectory) return;
    e.stopPropagation();

    setDropZoneClass((prev) => (prev ? "" : prev));
    setTooltipPosition(null);

    if (clipBoard?.files && clipBoard.files.length > 0) {
      handlePasting(file);
    } else if (onDropExternal) {
      onDropExternal(file.path, e.dataTransfer);
    }
  };

  useEffect(() => {
    setFileSelected(selectedFileIndexes.includes(index));
  }, [selectedFileIndexes, index]);

  return (
    <div
      className={`file-item-container ${dropZoneClass} ${
        fileSelected || !!file.isEditing ? "file-selected" : ""
      } ${isFileMoving ? "file-moving" : ""}`}
      tabIndex={0}
      title={file.name}
      onClick={handleFileSelection}
      onKeyDown={handleOnKeyDown}
      onContextMenu={handleItemContextMenu}
      onMouseEnter={preloadDataUrl}
      onPointerDown={preloadDataUrl}
      draggable={!file.isEditing && draggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragEnter={handleDragEnterOver}
      onDragOver={handleDragEnterOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="file-item">
        {file.isDirectory ? (
          <FolderIcon size={iconSize} />
        ) : (
          <>
            {fileIcons[file.name?.split(".").pop()?.toLowerCase()] ?? <FaRegFile size={iconSize} color="#7a8696" />}
          </>
        )}

        {file.isEditing ? (
          <div className={`rename-file-container ${activeLayout}`}>
            {triggerAction.actionType === "createFolder" ? (
              <CreateFolderAction
                filesViewRef={filesViewRef}
                file={file}
                onCreateFolder={onCreateFolder}
                triggerAction={triggerAction}
              />
            ) : (
              <RenameAction
                filesViewRef={filesViewRef}
                file={file}
                onRename={onRename}
                triggerAction={triggerAction}
              />
            )}
          </div>
        ) : (
          <span className="text-truncate file-name">{file.name}</span>
        )}
      </div>

      {activeLayout === "list" && (
        <>
          <div className="modified-date">{formatDate(file.updatedAt)}</div>
          <div className="size">{file?.size > 0 ? getDataSize(file?.size) : ""}</div>
        </>
      )}

      {/* Drag Icon & Tooltip Setup */}
      {tooltipPosition && (
        <div
          style={{
            top: `${tooltipPosition.y}px`,
            left: `${tooltipPosition.x}px`,
          }}
          className="drag-move-tooltip"
        >
          Move to <span className="drop-zone-file-name">{file.name}</span>
        </div>
      )}
    </div>
  );
};

export default FileItem;
