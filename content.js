// Funciones de comprobación de dominio
function isNorthgateDomain() {
    const host = window.location.hostname;
    const isLocalNg = (window.location.protocol === "file:" && 
        (document.title.includes("NORTHGATE") || window.location.href.includes("NORTHGATE") || window.location.href.includes("ng_matei")));
    return host === "nthp.northgateplc.es" || host.endsWith(".northgateplc.es") || isLocalNg;
}

function isOtherDomain() {
    const host = window.location.hostname;
    return host === "nextfleet.servicenext.eu" || 
           host.endsWith(".nextfleet.servicenext.eu") ||
           host === "nextfleet.services.eu" || 
           host.endsWith(".nextfleet.services.eu") ||
           host.includes("nextfleet") ||
           host === "localhost" || 
           host === "127.0.0.1" ||
           (window.location.protocol === "file:" && (document.title.includes("NEXT FLEET") || document.title.includes("NextFleet")));
}

function isOutlookDomain() {
    const host = window.location.hostname;
    return host === "outlook.office.com" || 
           host === "outlook.live.com" || 
           host === "outlook.office365.com" || 
           host.endsWith(".outlook.office.com") || 
           host.endsWith(".outlook.live.com") || 
           host.endsWith(".outlook.office365.com") || 
           host.includes("outlook");
}

// Inicialización al cargar la página
(function main() {
    if (isNorthgateDomain()) {
        if (window.NGCPTBar) {
            window.NGCPTBar.init();
        }
    } else if (isOtherDomain()) {
        if (window.NextfleetBar) {
            window.NextfleetBar.init();
        }
    } else if (isOutlookDomain()) {
        if (window.OutlookAutoNG) {
            window.OutlookAutoNG.init();
        }
    }
})();

// Función para insertar la fecha de hoy en formato DD/MM (XX/YY) en el cursor del elemento activo
function insertAutoDate() {
    const active = document.activeElement;
    if (!active) return;
    if (!(active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
    if (typeof active.selectionStart !== "number") return;

    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dateStr = `${day}/${month}`;

    const selStart = active.selectionStart;
    const selEnd = active.selectionEnd;
    
    const newValue = 
        active.value.substring(0, selStart) +
        dateStr +
        active.value.substring(selEnd);

    if (active.setRangeText) {
        active.setRangeText(dateStr, selStart, selEnd, "end");
        active.dispatchEvent(new Event('input', { bubbles: true }));
        active.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
        active.value = newValue;
        const newPos = selStart + dateStr.length;
        active.selectionStart = active.selectionEnd = newPos;
        active.dispatchEvent(new Event('input', { bubbles: true }));
        active.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

// Obtiene el texto seleccionado en la página (tanto texto plano como dentro de inputs/textareas)
function getSelectedText() {
    let text = "";
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
        const start = active.selectionStart;
        const end = active.selectionEnd;
        if (typeof start === "number" && typeof end === "number") {
            text = active.value.substring(start, end);
        }
    }
    if (!text && window.getSelection) {
        text = window.getSelection().toString();
    }
    return text.trim();
}

// Ejecuta la apertura de una nueva orden de Northgate en base al texto seleccionado
function runAutoNg() {
    const selected = getSelectedText();
    if (!selected) return;

    const url = `https://nthp.northgateplc.es/pro/web/orden.html?id=${encodeURIComponent(selected)}`;
    chrome.runtime.sendMessage({ action: "openTab", url: url });
}
window.runAutoNg = runAutoNg;

// Delegador de mensajes del Background (comandos/atajos)
chrome.runtime.onMessage.addListener((msg) => {
    // 1. Comandos globales (disponibles en cualquier dominio)
    if (msg.action === "auto-date") {
        chrome.storage.sync.get("enableAutoDate", ({ enableAutoDate }) => {
            if (enableAutoDate !== false) { // Habilitado por defecto si es undefined
                insertAutoDate();
            }
        });
    } else if (msg.action === "auto-ng") {
        chrome.storage.sync.get("enableAutoNg", ({ enableAutoNg }) => {
            if (enableAutoNg !== false) { // Habilitado por defecto si es undefined
                runAutoNg();
            }
        });
    } else if (msg.action === "fixMatriculaCommand") {
        if (window.NGCPTBar && typeof window.NGCPTBar.fixMatricula === "function") {
            window.NGCPTBar.fixMatricula();
        }
    }

    // 2. Comandos específicos de barra por dominio
    if (isNorthgateDomain() && window.NGCPTBar) {
        if (msg.action === "toggleBarra") {
            window.NGCPTBar.toggle();
        }
    } else if (isOtherDomain() && window.NextfleetBar) {
        if (msg.action === "toggleBarra") {
            window.NextfleetBar.toggle();
        }
    }

    // 3. Puente de arrastre de archivos desde el explorador TMT
    if (msg.action === "tmtUpdateDraggingFiles") {
        window.postMessage({ type: "TMT_SET_DRAGGING_FILES", files: msg.files }, "*");
    }
});

// Respaldo proactivo al entrar arrastrando a la ventana
window.addEventListener("dragenter", () => {
    chrome.runtime.sendMessage({ action: "tmtGetDraggingFiles" }, (res) => {
        if (res && res.files) {
            window.postMessage({ type: "TMT_SET_DRAGGING_FILES", files: res.files }, "*");
        }
    });
}, true);
