document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("openExplorer").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "openExplorer" });
    });


    //
    // === AUTO-OPEN ===
    //
    chrome.storage.sync.get("autoOpenBar", ({ autoOpenBar }) => {
        if (autoOpenBar === undefined) {
            autoOpenBar = true;
            chrome.storage.sync.set({ autoOpenBar: true });
        }
        document.getElementById("autoOpen").checked = autoOpenBar;
    });

    document.getElementById("autoOpen").addEventListener("change", (e) => {
        chrome.storage.sync.set({ autoOpenBar: e.target.checked });
    });



    //
    // === POSICIÓN DE BARRA ===
    //
    chrome.storage.sync.get("barraPos", ({ barraPos }) => {
        document.getElementById("barraPos").value = barraPos || "right";
    });

    document.getElementById("barraPos").addEventListener("change", (e) => {
        chrome.storage.sync.set({ barraPos: e.target.value });
    });







    //
    // === ACTIVAR ATAJO CORRECTOR MATRÍCULAS ===
    //
    chrome.storage.sync.get("enableMatShortcut", ({ enableMatShortcut }) => {
        document.getElementById("enableMatShortcut").checked = enableMatShortcut ?? true;
    });

    document.getElementById("enableMatShortcut").addEventListener("change", (e) => {
        chrome.storage.sync.set({ enableMatShortcut: e.target.checked });
    });
    //
    // === AUTO-OPEN NFBAR ===
    //
    chrome.storage.sync.get("autoOpenNFBar", ({ autoOpenNFBar }) => {
        if (autoOpenNFBar === undefined) {
            autoOpenNFBar = true;
            chrome.storage.sync.set({ autoOpenNFBar: true });
        }
        document.getElementById("autoOpenNFBar").checked = autoOpenNFBar;
    });

    document.getElementById("autoOpenNFBar").addEventListener("change", (e) => {
        chrome.storage.sync.set({ autoOpenNFBar: e.target.checked });
    });

    //
    // === RESALTAR ÓRDENES EN ESPERA ===
    //
    chrome.storage.sync.get("enableHighlightEspera", ({ enableHighlightEspera }) => {
        if (enableHighlightEspera === undefined) {
            enableHighlightEspera = true;
            chrome.storage.sync.set({ enableHighlightEspera: true });
        }
        document.getElementById("enableHighlightEspera").checked = enableHighlightEspera;
    });

    document.getElementById("enableHighlightEspera").addEventListener("change", (e) => {
        chrome.storage.sync.set({ enableHighlightEspera: e.target.checked });
    });

    //
    // === COPIAR MATRÍCULA E ID AL HACER CLIC ===
    //
    chrome.storage.sync.get("enableCopyMatriculaAndId", ({ enableCopyMatriculaAndId }) => {
        if (enableCopyMatriculaAndId === undefined) {
            enableCopyMatriculaAndId = true;
            chrome.storage.sync.set({ enableCopyMatriculaAndId: true });
        }
        document.getElementById("enableCopyMatriculaAndId").checked = enableCopyMatriculaAndId;
    });

    document.getElementById("enableCopyMatriculaAndId").addEventListener("change", (e) => {
        chrome.storage.sync.set({ enableCopyMatriculaAndId: e.target.checked });
    });

    //
    // === HABILITAR COMANDOS AUTODATE ===
    //
    chrome.storage.sync.get("enableAutoDate", ({ enableAutoDate }) => {
        if (enableAutoDate === undefined) {
            enableAutoDate = true;
            chrome.storage.sync.set({ enableAutoDate: true });
        }
        document.getElementById("enableAutoDate").checked = enableAutoDate;
    });

    document.getElementById("enableAutoDate").addEventListener("change", (e) => {
        chrome.storage.sync.set({ enableAutoDate: e.target.checked });
    });

    //
    // === HABILITAR COMANDO AUTONG ===
    //
    chrome.storage.sync.get("enableAutoNg", ({ enableAutoNg }) => {
        if (enableAutoNg === undefined) {
            enableAutoNg = true;
            chrome.storage.sync.set({ enableAutoNg: true });
        }
        document.getElementById("enableAutoNg").checked = enableAutoNg;
    });

    document.getElementById("enableAutoNg").addEventListener("change", (e) => {
        chrome.storage.sync.set({ enableAutoNg: e.target.checked });
    });

});
