// Atajo de teclado
chrome.commands.onCommand.addListener((command) => {
    if (command === "toggle-barra") {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, { action: "toggleBarra" }).catch(() => {
                // Silenciar error si el script no está cargado
            });
        });
    }
});

// Explorador de archivos (pestaña propia de la extensión): si ya está abierto, se enfoca en vez de duplicarlo
async function abrirExplorador() {
    const url = chrome.runtime.getURL("explorador/index.html");
    const [existente] = await chrome.tabs.query({ url });
    if (existente) {
        await chrome.tabs.update(existente.id, { active: true });
        await chrome.windows.update(existente.windowId, { focused: true });
        chrome.tabs.sendMessage(existente.id, { action: "refreshExplorer" }).catch(() => {});
    } else {
        await chrome.tabs.create({ url });
    }
}

// Al devolver el foco a la pestaña del explorador haciendo clic en ella, actualizar la lista de archivos
chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        const url = chrome.runtime.getURL("explorador/index.html");
        if (tab.url && tab.url.startsWith(url)) {
            chrome.tabs.sendMessage(tab.id, { action: "refreshExplorer" }).catch(() => {});
        }
    } catch {}
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "abrir-explorador",
        title: "Abrir explorador de archivos",
        contexts: ["action"]
    });
});

chrome.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId === "abrir-explorador") abrirExplorador();
});

// Escucha globalmente los atajos listados en manifest.json y evita errores si la pestaña no admite content scripts
chrome.commands.onCommand.addListener((command) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;
        chrome.tabs.sendMessage(tabs[0].id, { action: command })
            .catch(() => {
                // No pasa nada: la pestaña no admite content scripts o no está lista.
            });
    });
});

// Clic en el icono de la extensión
chrome.action.onClicked.addListener((tab) => {
    chrome.tabs.sendMessage(tab.id, { action: "toggleBarra" }).catch(() => {
        // Silenciar error si el script no está cargado
    });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "openOptions") {
        chrome.runtime.openOptionsPage();
    } else if (msg.action === "openExplorer") {
        abrirExplorador();
    } else if (msg.action === "openTab") {
        chrome.tabs.create({ url: msg.url });
    }
});

chrome.commands.onCommand.addListener(async (command) => { // Listener global del atajo corrector de matrículas.
    if (command !== "fix-matricula") return;

    // Ver si el usuario tiene activado el corrector
    const { enableMatShortcut } = await chrome.storage.sync.get("enableMatShortcut");
    if (enableMatShortcut === false) return;

    // Obtener pestaña activa
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) return;

        chrome.tabs.sendMessage(tabs[0].id, { action: "fixMatriculaCommand" }).catch(() => {
            // Silenciar error si el script no está cargado
        });
    });
});

