/**
 * outlook_autong.js
 * 
 * Componente de TMT para Outlook Web (outlook.office.com, outlook.live.com).
 * Detecta números de autorización de Northgate (10 dígitos) en la cabecera/asunto
 * de los correos e inyecta un botón temático verde "Ver en NG".
 */

(function () {
    "use strict";

    let observadorIniciado = false;

    function inyectarEstilosOutlook() {
        if (document.getElementById("tmt-outlook-styles")) return;

        const styles = document.createElement("style");
        styles.id = "tmt-outlook-styles";
        styles.textContent = `
            button.tmt-outlook-ver-ng {
                display: inline-flex !important;
                align-items: center !important;
                gap: 5px !important;
                background-color: #107c41 !important;
                color: #ffffff !important;
                border: 1px solid #0e6c38 !important;
                border-radius: 6px !important;
                padding: 3px 10px !important;
                margin-left: 8px !important;
                font-size: 13px !important;
                font-weight: 600 !important;
                line-height: 1.4 !important;
                cursor: pointer !important;
                user-select: none !important;
                vertical-align: middle !important;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15) !important;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                text-decoration: none !important;
                outline: none !important;
            }

            button.tmt-outlook-ver-ng:hover {
                background-color: #0d6334 !important;
                border-color: #094725 !important;
                color: #ffffff !important;
                transform: translateY(-1px) !important;
                box-shadow: 0 3px 8px rgba(16, 124, 65, 0.35) !important;
            }

            button.tmt-outlook-ver-ng:active {
                transform: translateY(0) scale(0.98) !important;
            }

            button.tmt-outlook-ver-ng .tmt-outlook-icon {
                display: inline-block !important;
                width: 13px !important;
                height: 13px !important;
                flex-shrink: 0 !important;
                background-color: currentColor !important;
                -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'/%3E%3Cpolyline points='15 3 21 3 21 9'/%3E%3Cline x1='10' y1='14' x2='21' y2='3'/%3E%3C/svg%3E") !important;
                mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'/%3E%3Cpolyline points='15 3 21 3 21 9'/%3E%3Cline x1='10' y1='14' x2='21' y2='3'/%3E%3C/svg%3E") !important;
                -webkit-mask-repeat: no-repeat !important;
                mask-repeat: no-repeat !important;
                -webkit-mask-position: center !important;
                mask-position: center !important;
                -webkit-mask-size: contain !important;
                mask-size: contain !important;
            }
        `;
        (document.head || document.documentElement).appendChild(styles);
    }

    let ultimaAperturaOutlook = 0;
    function abrirOrdenNorthgate(ngId) {
        if (!ngId) return;
        const ahora = Date.now();
        if (ahora - ultimaAperturaOutlook < 1000) return; // Evitar doble apertura
        ultimaAperturaOutlook = ahora;

        const url = `https://nthp.northgateplc.es/pro/web/orden.html?id=${encodeURIComponent(ngId)}`;
        // Si la extensión se recargó, el content script queda huérfano y chrome.runtime desaparece
        try {
            if (!chrome.runtime || !chrome.runtime.id) throw new Error("Extension context invalidated");
            chrome.runtime.sendMessage({ action: "openTab", url: url });
        } catch (e) {
            window.open(url, "_blank");
        }
    }

    function escanearYActualizarOutlook() {
        // Selectores habituales del asunto en el panel de lectura de Outlook Web
        const subjectCandidates = document.querySelectorAll(
            'span[id*="_SUBJECT"], [role="heading"][id*="SUBJECT"], div.HlO3X, [data-testid="reading-pane-subject"], .ConversationReadingPaneContainer [role="heading"]'
        );

        subjectCandidates.forEach(el => {
            // Si el elemento es un contenedor (ej: div.HlO3X), buscar el span o heading interno
            let targetEl = el;
            if (el.tagName === "DIV") {
                const inner = el.querySelector('span[id*="_SUBJECT"], [role="heading"], span.JdFsz');
                if (inner) targetEl = inner;
            }

            const text = (targetEl.getAttribute("title") || targetEl.textContent || "").trim();
            if (!text) return;

            // Buscar número de autorización de Northgate (10 dígitos empezando por 202* o 20*)
            // Evita totalmente números de teléfono
            const match = text.match(/\b(202\d{7})\b/) || text.match(/\b(20\d{8})\b/);
            if (!match) return;

            const ngId = match[1];

            // Localizar el contenedor padre donde insertar el botón
            const parent = targetEl.parentElement || targetEl;
            let btn = parent.querySelector(".tmt-outlook-ver-ng");

            if (!btn) {
                btn = document.createElement("button");
                btn.type = "button";
                btn.className = "tmt-outlook-ver-ng";
                btn.dataset.ngId = ngId;
                btn.title = `Abrir orden ${ngId} en Northgate`;
                btn.innerHTML = `
                    <span class="tmt-outlook-icon" aria-hidden="true"></span>
                    <span>Ver en NG</span>
                `;

                targetEl.insertAdjacentElement("afterend", btn);
                console.log("TMT: Botón 'Ver en NG' insertado en Outlook para la orden:", ngId);
            } else if (btn.dataset.ngId !== ngId) {
                btn.dataset.ngId = ngId;
                btn.title = `Abrir orden ${ngId} en Northgate`;
            }
        });
    }

    function iniciarObservadorOutlook() {
        if (observadorIniciado) return;
        observadorIniciado = true;

        inyectarEstilosOutlook();
        escanearYActualizarOutlook();

        // Monitorear cambios en el DOM para cuando el usuario hace clic en otros correos
        const observer = new MutationObserver(() => {
            escanearYActualizarOutlook();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Intervalo de respaldo periódico
        setInterval(escanearYActualizarOutlook, 600);
    }

    // Delegación global única de clic en botones de Outlook con protección anti-doble apertura
    document.addEventListener("click", (e) => {
        const btn = e.target.closest && e.target.closest(".tmt-outlook-ver-ng");
        if (btn) {
            e.stopPropagation();
            e.preventDefault();
            const ngId = btn.dataset.ngId;
            if (ngId) {
                abrirOrdenNorthgate(ngId);
            }
        }
    }, true);

    window.OutlookAutoNG = {
        init: iniciarObservadorOutlook
    };
})();
