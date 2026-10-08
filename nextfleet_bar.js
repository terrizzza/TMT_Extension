window.NextfleetBar = (function() {
    let barra = null;
    let toastContainer = null;
    let resaltarEsperaHabilitado = true;
    let copiarMatriculaEIdHabilitado = true;
    let programarEsperaRAF = null;

    let ultimaAperturaNG = 0;
    function abrirOrdenNorthgate(ngId) {
        if (!ngId) return;
        const ahora = Date.now();
        if (ahora - ultimaAperturaNG < 1000) return; // Evitar doble disparo
        ultimaAperturaNG = ahora;

        const url = `https://nthp.northgateplc.es/pro/web/orden.html?id=${encodeURIComponent(ngId)}`;
        chrome.runtime.sendMessage({ action: "openTab", url: url });
    }

    function init() {
        console.log("TMT - NextFleet: Módulo cargado.");

        inyectarEstilosEspera();
        inyectarEstilosCopiarMatriculaEId();

        // Cargar configuración de resaltado de espera y copia de matrícula/ID
        if (typeof chrome !== "undefined" && chrome?.storage?.sync) {
            chrome.storage.sync.get(["enableHighlightEspera", "enableCopyMatriculaAndId"], (res) => {
                if (res.enableHighlightEspera !== undefined) {
                    resaltarEsperaHabilitado = res.enableHighlightEspera;
                }
                if (res.enableCopyMatriculaAndId !== undefined) {
                    copiarMatriculaEIdHabilitado = res.enableCopyMatriculaAndId;
                }
                actualizarBotonesMatriculaEId();
                programarActualizacionEspera();
            });

            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === "sync") {
                    if (changes.enableHighlightEspera !== undefined) {
                        resaltarEsperaHabilitado = changes.enableHighlightEspera.newValue;
                        programarActualizacionEspera();
                    }
                    if (changes.enableCopyMatriculaAndId !== undefined) {
                        copiarMatriculaEIdHabilitado = changes.enableCopyMatriculaAndId.newValue;
                        actualizarBotonesMatriculaEId();
                    }
                }
            });
        }

        // Observar redimensionado de pantalla y cambios en DOM
        window.addEventListener("resize", () => {
            if (barra && barra.style.display !== "none") {
                ajustarPosicionBarra();
            }
        });
        iniciarObservadorDOM();
        actualizarBotonesMatriculaEId();
        setInterval(actualizarBotonesMatriculaEId, 400);
        programarActualizacionEspera();

        // Escuchar clics en el documento para acciones interactivas
        document.addEventListener("click", (e) => {
            const target = e.target;
            if (!target) return;

            // Manejo de clic para copiar matrícula o ID con soporte de delegación
            if (copiarMatriculaEIdHabilitado) {
                const btnMat = target.closest(".tmt-btn-matricula, .tmt-btn-placa");
                if (btnMat) {
                    const plate = btnMat.dataset.tmtPlate || btnMat.textContent.trim();
                    if (plate) {
                        copiarTextoAlPortapapeles(plate, btnMat, `¡Matrícula ${plate} copiada!`);
                        return;
                    }
                }

                const btnId = target.closest(".tmt-btn-id");
                if (btnId) {
                    const id = btnId.dataset.id || btnId.textContent.replace(/\D/g, "");
                    if (id) {
                        copiarTextoAlPortapapeles(id, btnId, `¡ID ${id} copiado!`);
                        return;
                    }
                }

                const btnTel = target.closest(".tmt-btn-tel");
                if (btnTel) {
                    const tel = btnTel.dataset.tel;
                    if (tel) {
                        copiarTextoAlPortapapeles(tel, btnTel, `¡Teléfono ${tel} copiado!`);
                        return;
                    }
                }

                const btnNg = target.closest(".tmt-btn-ver-ng");
                if (btnNg) {
                    const ngId = btnNg.dataset.ngId;
                    if (ngId) {
                        abrirOrdenNorthgate(ngId);
                        return;
                    }
                }

                const cabeceraLabel = target.closest(".cuerpo-Cabecera-Ficha label, .contenedor-Cabecera-Ficha label");
                if (cabeceraLabel) {
                    const match = cabeceraLabel.textContent.match(/(?:ID|Id|id)\s*[:#]?\s*(\d+)/);
                    if (match) {
                        const id = match[1];
                        const targetBtn = cabeceraLabel.querySelector(".tmt-btn-id") || cabeceraLabel;
                        copiarTextoAlPortapapeles(id, targetBtn, `¡ID ${id} copiado!`);
                        return;
                    }
                }
            }

            // Encontrar el contenedor interactivo más cercano
            const clickable = target.closest("button, a, [role='button'], .btn, .button") || target;
            const stripAccents = str => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            // Reemplazar múltiples espacios y saltos de línea por un único espacio
            const text = stripAccents(clickable.textContent.replace(/\s+/g, ' ').trim().toLowerCase());

            // Imprimir traza de depuración en consola para que el usuario/desarrollador pueda ver qué cazo el script
            console.log("NG CPT Clic detectado en:", clickable.tagName, "| Texto:", text);

            // Coincidencia estricta: debe contener "nuevo" y además ("fichero", "adjunto" o "archivo")
            const coincideTexto = text.includes("nuevo") && 
                                  (text.includes("fichero") || text.includes("adjunto") || text.includes("archivo"));

            // Aumentamos el límite de longitud a 100 para compensar iconos o textos más largos en la nueva versión
            if (text.length < 100 && coincideTexto) {
                console.log("NG CPT: Coincidencia de nuevo adjunto detectada. Abriendo barra.");
                
                // Retraso de 350ms para dar tiempo a NextFleet a renderizar la ventana/formulario en el DOM
                setTimeout(() => {
                    if (!barra || barra.style.display === "none") {
                        toggleBarra();
                    }
                }, 350);
            }
        }, true);
    }

    function toggleBarra() {
        if (!barra) {
            crearBarra();
        } else {
            const isHidden = barra.style.display === "none";
            barra.style.display = isHidden ? "flex" : "none";
            if (isHidden) {
                mostrarToast("Barra rápida mostrada");
            }
        }
        if (barra && barra.style.display !== "none") {
            ajustarPosicionBarra();
            // Reintentos asíncronos para acoplarse conforme se completa la transición CSS de apertura
            setTimeout(ajustarPosicionBarra, 100);
            setTimeout(ajustarPosicionBarra, 250);
            setTimeout(ajustarPosicionBarra, 500);
            setTimeout(ajustarPosicionBarra, 1000);
        }
    }

    function ajustarPosicionBarra() {
        if (!barra) return;
        const offcanvas = document.getElementById("contenedor-Cuerpo-Ficha") || 
                          document.querySelector('[id*="contenedor-Cuerpo-Ficha"]') ||
                          document.querySelector(".contenedor-Cuerpo-Ficha") || 
                          document.querySelector(".offcanvas-body");
        
        if (offcanvas) {
            const parent = offcanvas.closest('.offcanvas') || offcanvas.parentElement || offcanvas;
            const elements = [parent, ...parent.querySelectorAll('*')];
            const candidates = [];
            
            // Límite izquierdo mínimo para considerar que un elemento pertenece al panel derecho
            // (el panel blanco normalmente no empieza a menos de 850px de la derecha, o sea, su left debe ser >= innerWidth - 850)
            const minLeftForPanel = window.innerWidth - 850;
            
            for (const el of elements) {
                const rect = el.getBoundingClientRect();
                const widthVal = rect.width || el.offsetWidth || 0;
                
                // Buscamos elementos cuyo ancho sea el de un panel visual normal (300px a 800px)
                if (widthVal >= 300 && widthVal <= 800) {
                    if (rect.left >= minLeftForPanel && rect.left < window.innerWidth) {
                        candidates.push({ el, left: rect.left });
                    }
                }
            }
            
            // Ordenamos de menor a mayor 'left' para encontrar el borde izquierdo más externo (el inicio del panel blanco)
            if (candidates.length > 0) {
                candidates.sort((a, b) => a.left - b.left);
                const targetLeft = candidates[0].left;
                console.log("TMT: Borde izquierdo del panel visual detectado en (mínimo left en zona derecha):", targetLeft);
                barra.style.right = `${window.innerWidth - targetLeft}px`;
                return;
            }
        }
        barra.style.right = "0";
    }

    function iniciarObservadorDOM() {
        const observer = new MutationObserver(() => {
            if (barra && barra.style.display !== "none") {
                ajustarPosicionBarra();
            }
            inyectarBotonesCopiar();
            actualizarBotonesMatriculaEId();
            programarActualizacionEspera();
        });
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function inyectarEstilosEspera() {
        if (document.getElementById("tmt-espera-styles")) return;

        const styles = document.createElement("style");
        styles.id = "tmt-espera-styles";
        styles.textContent = `
            /* TMT - NextFleet: Resaltado de órdenes En Espera */
            tr.tmt-fila-espera > td {
                background-color: #e5e7eb !important;
                background-image: repeating-linear-gradient(
                    -45deg,
                    rgba(100, 116, 139, 0.08),
                    rgba(100, 116, 139, 0.08) 12px,
                    rgba(100, 116, 139, 0.18) 12px,
                    rgba(100, 116, 139, 0.18) 24px
                ) !important;
            }

            /* Efecto hover sobre la fila en espera */
            tr.tmt-fila-espera:hover > td {
                background-color: #d8dbe0 !important;
                background-image: repeating-linear-gradient(
                    -45deg,
                    rgba(71, 85, 105, 0.12),
                    rgba(71, 85, 105, 0.12) 12px,
                    rgba(71, 85, 105, 0.22) 12px,
                    rgba(71, 85, 105, 0.22) 24px
                ) !important;
            }

            /* Fila en espera que además está seleccionada */
            tr.tmt-fila-espera.filaSeleccionada-Tabla_BS > td {
                background-color: #cbd5e1 !important;
                background-image: repeating-linear-gradient(
                    -45deg,
                    rgba(30, 58, 138, 0.10),
                    rgba(30, 58, 138, 0.10) 12px,
                    rgba(30, 58, 138, 0.22) 12px,
                    rgba(30, 58, 138, 0.22) 24px
                ) !important;
            }
        `;
        (document.head || document.documentElement).appendChild(styles);
    }

    function inyectarEstilosCopiarMatriculaEId() {
        if (document.getElementById("tmt-copiar-matricula-id-styles")) return;

        const styles = document.createElement("style");
        styles.id = "tmt-copiar-matricula-id-styles";
        styles.textContent = `
            /* TMT - Botón Placa de Matrícula (estilo matrícula europea/española) */
            button.tmt-btn-placa {
                display: inline-flex !important;
                align-items: center !important;
                height: 32px !important;
                padding: 0 8px 0 0 !important;
                margin: 0 4px !important;
                border-radius: 5px !important;
                background: #ffffff !important;
                border: 1.5px solid #0f172a !important;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
                cursor: pointer !important;
                user-select: none !important;
                overflow: hidden !important;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                vertical-align: middle !important;
                box-sizing: border-box !important;
            }

            button.tmt-btn-placa:hover {
                border-color: #2563eb !important;
                transform: translateY(-1px) !important;
                box-shadow: 0 3px 8px rgba(37, 99, 235, 0.25) !important;
            }

            button.tmt-btn-placa:active {
                transform: translateY(0) scale(0.98) !important;
            }

            /* Banda azul UE de la placa */
            button.tmt-btn-placa .tmt-placa-banda-eu {
                background-color: #003399 !important;
                color: #ffffff !important;
                width: 17px !important;
                height: 100% !important;
                min-height: 28px !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                margin-right: 7px !important;
                padding: 0 !important;
                flex-shrink: 0 !important;
                box-sizing: border-box !important;
            }

            button.tmt-btn-placa .tmt-placa-pais {
                font-size: 13px !important;
                font-weight: 900 !important;
                line-height: 1 !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                color: #ffffff !important;
            }

            /* Número de matrícula */
            button.tmt-btn-placa .tmt-placa-numero {
                color: #0f172a !important;
                font-family: 'DIN Alternate', 'Arial Black', Impact, -apple-system, sans-serif !important;
                font-size: 16px !important;
                font-weight: 800 !important;
                letter-spacing: 1.5px !important;
                text-transform: uppercase !important;
                line-height: 1 !important;
                padding: 0 2px !important;
            }

            /* Icono copiar placa */
            button.tmt-btn-placa .tmt-copy-icon {
                display: inline-block !important;
                width: 13px !important;
                height: 13px !important;
                margin-left: 5px !important;
                flex-shrink: 0 !important;
                background-color: currentColor !important;
                opacity: 0.45 !important;
                -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='14' height='14' x='8' y='8' rx='2' ry='2'/%3E%3Cpath d='M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'/%3E%3C/svg%3E") !important;
                mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='14' height='14' x='8' y='8' rx='2' ry='2'/%3E%3Cpath d='M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'/%3E%3C/svg%3E") !important;
                -webkit-mask-repeat: no-repeat !important;
                mask-repeat: no-repeat !important;
                -webkit-mask-position: center !important;
                mask-position: center !important;
                -webkit-mask-size: contain !important;
                mask-size: contain !important;
                transition: all 0.2s ease !important;
            }

            button.tmt-btn-placa:hover .tmt-copy-icon {
                opacity: 0.9 !important;
                transform: scale(1.1) !important;
            }

            button.tmt-btn-placa.tmt-copiado {
                background-color: #dcfce7 !important;
                border-color: #16a34a !important;
                color: #15803d !important;
            }

            button.tmt-btn-placa.tmt-copiado .tmt-placa-numero {
                color: #15803d !important;
            }

            button.tmt-btn-placa.tmt-copiado .tmt-copy-icon {
                opacity: 1 !important;
                background-color: #15803d !important;
                -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E") !important;
                mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E") !important;
            }

            /* TMT - Botón Ver en NG (Northgate) */
            button.tmt-btn-ver-ng {
                display: inline-flex !important;
                align-items: center !important;
                gap: 6px !important;
                height: 32px !important;
                padding: 0 10px !important;
                margin: 0 4px !important;
                border-radius: 6px !important;
                background-color: #f0fdf4 !important;
                border: 1.5px solid #16a34a !important;
                color: #15803d !important;
                font-size: 14px !important;
                font-weight: 700 !important;
                cursor: pointer !important;
                user-select: none !important;
                box-shadow: 0 1px 3px rgba(22, 163, 74, 0.15) !important;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                font-family: inherit !important;
                vertical-align: middle !important;
                box-sizing: border-box !important;
            }

            button.tmt-btn-ver-ng:hover {
                background-color: #16a34a !important;
                color: #ffffff !important;
                border-color: #15803d !important;
                transform: translateY(-1px) !important;
                box-shadow: 0 3px 8px rgba(22, 163, 74, 0.3) !important;
            }

            button.tmt-btn-ver-ng:active {
                transform: translateY(0) scale(0.98) !important;
            }

            button.tmt-btn-ver-ng .tmt-ng-icon {
                display: inline-block !important;
                width: 14px !important;
                height: 14px !important;
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

            /* TMT - Botón Teléfono (extraído de las observaciones) */
            button.tmt-btn-tel {
                display: inline-flex !important;
                align-items: center !important;
                gap: 6px !important;
                height: 32px !important;
                padding: 0 10px !important;
                margin: 0 4px !important;
                border-radius: 6px !important;
                background-color: #eff6ff !important;
                border: 1.5px solid #2563eb !important;
                color: #1d4ed8 !important;
                font-size: 14px !important;
                font-weight: 700 !important;
                cursor: pointer !important;
                user-select: none !important;
                box-shadow: 0 1px 3px rgba(37, 99, 235, 0.15) !important;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
                font-family: inherit !important;
                vertical-align: middle !important;
                box-sizing: border-box !important;
            }

            button.tmt-btn-tel:hover {
                background-color: #2563eb !important;
                color: #ffffff !important;
                border-color: #1d4ed8 !important;
                transform: translateY(-1px) !important;
                box-shadow: 0 3px 8px rgba(37, 99, 235, 0.3) !important;
            }

            button.tmt-btn-tel:active {
                transform: translateY(0) scale(0.98) !important;
            }

            button.tmt-btn-tel .tmt-tel-icon {
                display: inline-block !important;
                width: 14px !important;
                height: 14px !important;
                flex-shrink: 0 !important;
                background-color: currentColor !important;
                -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'/%3E%3C/svg%3E") !important;
                mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'/%3E%3C/svg%3E") !important;
                -webkit-mask-repeat: no-repeat !important;
                mask-repeat: no-repeat !important;
                -webkit-mask-position: center !important;
                mask-position: center !important;
                -webkit-mask-size: contain !important;
                mask-size: contain !important;
            }

            /* TMT - Botón sustituto de Cabecera ID (reemplaza al <label>) */
            button.tmt-btn-id {
                display: inline-flex !important;
                align-items: center !important;
                gap: 8px !important;
                background: transparent !important;
                border: 1px solid transparent !important;
                border-radius: 6px !important;
                padding: 2px 8px !important;
                font-size: 18px !important;
                line-height: 38px !important;
                color: #cd8600 !important; /* Heredado de .cuerpo-Cabecera-Ficha label */
                cursor: pointer !important;
                transition: all 0.2s ease !important;
                font-family: inherit !important;
                text-align: left !important;
                user-select: none !important;
                height: auto !important;
            }

            button.tmt-btn-id:hover {
                background: rgba(0, 0, 0, 0.04) !important;
                border-color: #cbd5e1 !important;
            }

            button.tmt-btn-id .tmt-header-title {
                color: inherit !important;
                font-size: 18px !important;
                font-weight: normal !important;
            }

            button.tmt-btn-id .tmt-id-badge {
                display: inline-flex !important;
                align-items: center !important;
                gap: 6px !important;
                font-size: 15px !important;
                font-weight: 700 !important;
                line-height: 1 !important;
                padding: 5px 12px !important;
                border-radius: 6px !important;
                background-color: #f8fafc !important;
                border: 1.5px solid #cbd5e1 !important;
                color: #1e293b !important;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06) !important;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
            }

            button.tmt-btn-id:hover .tmt-id-badge {
                background-color: #eff6ff !important;
                border-color: #2563eb !important;
                color: #1d4ed8 !important;
                transform: translateY(-1px) !important;
                box-shadow: 0 3px 8px rgba(37, 99, 235, 0.2) !important;
            }

            button.tmt-btn-id .tmt-copy-icon {
                display: inline-block !important;
                width: 14px !important;
                height: 14px !important;
                margin-left: 4px !important;
                flex-shrink: 0 !important;
                background-color: currentColor !important;
                opacity: 0.7 !important;
                -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='14' height='14' x='8' y='8' rx='2' ry='2'/%3E%3Cpath d='M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'/%3E%3C/svg%3E") !important;
                mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='14' height='14' x='8' y='8' rx='2' ry='2'/%3E%3Cpath d='M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'/%3E%3C/svg%3E") !important;
                -webkit-mask-repeat: no-repeat !important;
                mask-repeat: no-repeat !important;
                -webkit-mask-position: center !important;
                mask-position: center !important;
                -webkit-mask-size: contain !important;
                mask-size: contain !important;
                transition: all 0.2s ease !important;
            }

            button.tmt-btn-id:hover .tmt-copy-icon {
                opacity: 1 !important;
                transform: scale(1.1) !important;
            }

            /* Estado copiado botón ID */
            button.tmt-btn-id.tmt-copiado .tmt-id-badge {
                background-color: #dcfce7 !important;
                border-color: #16a34a !important;
                color: #15803d !important;
            }

            button.tmt-btn-id.tmt-copiado .tmt-copy-icon {
                opacity: 1 !important;
                background-color: #15803d !important;
                -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E") !important;
                mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E") !important;
            }

            .tmt-floating-feedback {
                animation: tmtFadeSlideUp 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }

            @keyframes tmtFadeSlideUp {
                0% {
                    opacity: 0;
                    transform: translate(-50%, 6px);
                }
                15% {
                    opacity: 1;
                    transform: translate(-50%, 0);
                }
                80% {
                    opacity: 1;
                    transform: translate(-50%, -3px);
                }
                100% {
                    opacity: 0;
                    transform: translate(-50%, -10px);
                }
            }
        `;
        (document.head || document.documentElement).appendChild(styles);
    }

    function obtenerMatriculaActual() {
        const containers = document.querySelectorAll('.cuerpo_dash_ficha_operacion');
        for (const container of containers) {
            const firstDiv = container.querySelector(':scope > div') || container.firstElementChild;
            if (!firstDiv) continue;

            const spans = Array.from(firstDiv.querySelectorAll('span'));
            const spanMat = spans.find(s => {
                const fs = s.style.fontSize;
                const fw = s.style.fontWeight;
                return (fs && fs.includes('22')) || (fw && (fw === 'bold' || fw >= 700));
            }) || (spans[0] && !spans[0].classList.contains('limitarTamanyoTexto') ? spans[0] : null);

            if (spanMat) {
                const rawPlate = spanMat.textContent.trim();
                if (rawPlate && /^[0-9A-Z\s-]{4,10}$/i.test(rawPlate)) {
                    return rawPlate;
                }
            }
        }
        return "";
    }

    function obtenerAutorizacionNorthgate() {
        // 1. Buscar en textareas de observaciones públicas
        const textareas = Array.from(document.querySelectorAll('textarea[tabindex="235"], textarea[id^="GRUPO_TAB_"], .tab-pane textarea, textarea'));
        for (const ta of textareas) {
            const val = (ta.value || ta.textContent || "").trim();
            if (!val) continue;

            // Prioridad 1: O.R: o etiqueta de orden seguida de 10 dígitos empezando por 20 (ej: 2026110029)
            const matchOR = val.match(/(?:O\.?R\.?|ORDEN(?:\s+DE\s+REPARACI[OÓ]N)?|AUT(?:ORIZACI[OÓ]N)?)\s*[:#]?\s*(20\d{8})\b/i);
            if (matchOR && matchOR[1]) {
                return matchOR[1];
            }

            // Prioridad 2: Número de Northgate de 10 dígitos que empiece por 202* (año 2020-2029) o 20*
            // Excluye completamente números de teléfono (+34, 6xx, 7xx, 8xx, 9xx)
            const match20 = val.match(/\b(202\d{7})\b/) || val.match(/\b(20\d{8})\b/);
            if (match20 && match20[1]) {
                return match20[1];
            }
        }

        // 2. Búsqueda de respaldo en el contenedor de ficha / offcanvas
        const offcanvas = document.querySelector('.offcanvas.show, .contenedor-Cuerpo-Ficha');
        if (offcanvas) {
            const text = offcanvas.innerText || offcanvas.textContent || "";
            const matchOR = text.match(/(?:O\.?R\.?|ORDEN(?:\s+DE\s+REPARACI[OÓ]N)?|AUT(?:ORIZACI[OÓ]N)?)\s*[:#]?\s*(20\d{8})\b/i);
            if (matchOR && matchOR[1]) {
                return matchOR[1];
            }
            const match20 = text.match(/\b(202\d{7})\b/) || text.match(/\b(20\d{8})\b/);
            if (match20 && match20[1]) {
                return match20[1];
            }
        }

        return "";
    }

    function obtenerTelefonoObservaciones() {
        // Teléfono español de 9 dígitos (empieza por 6, 7, 8 o 9), con prefijo +34/0034 y separadores opcionales.
        // Los lookarounds evitan cortar números más largos, como la OR de 10 dígitos (20xxxxxxxx).
        const reTel = /(?<![\d+])(?:(?:\+|00)34[\s.-]?)?([6-9]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}|[6-9]\d[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2})(?!\d)/;

        const textareas = Array.from(document.querySelectorAll('textarea[tabindex="235"], textarea[id^="GRUPO_TAB_"], .tab-pane textarea, textarea'));
        for (const ta of textareas) {
            const val = (ta.value || ta.textContent || "").trim();
            if (!val) continue;

            const m = val.match(reTel);
            if (m) return m[1].replace(/\D/g, "");
        }
        return "";
    }

    function actualizarBotonesMatriculaEId() {
        actualizarCabeceraNextfleet();
    }

    function actualizarCabeceraNextfleet() {
        if (!copiarMatriculaEIdHabilitado) return;

        const cabeceras = document.querySelectorAll(
            '.cuerpo-Cabecera-Ficha, .contenedor-Cabecera-Ficha, [class*="Cabecera-Ficha"]'
        );

        const plate = obtenerMatriculaActual();
        const ngId = obtenerAutorizacionNorthgate();
        const telefono = obtenerTelefonoObservaciones();

        cabeceras.forEach(cabecera => {
            // Asegurar que el contenedor permita disponer horizontalmente los botones
            if (cabecera.classList.contains("cuerpo-Cabecera-Ficha") || cabecera.querySelector('label')) {
                cabecera.style.display = "inline-flex";
                cabecera.style.alignItems = "center";
                cabecera.style.flexWrap = "wrap";
                cabecera.style.gap = "6px";
            }

            // 1. Manejo del botón ID
            let btnId = cabecera.querySelector(".tmt-btn-id");
            if (!btnId) {
                const label = cabecera.querySelector('label');
                if (label) {
                    const currentText = label.textContent || '';
                    const match = currentText.match(/(?:ID|Id|id)\s*[:#]?\s*(\d+)/);
                    if (match) {
                        const idNum = match[1];
                        const fullMatchStr = match[0]; // ej: "ID 40925"
                        const splitIndex = currentText.indexOf(fullMatchStr);
                        let prefix = splitIndex !== -1 ? currentText.substring(0, splitIndex) : currentText.replace(fullMatchStr, "");
                        let suffix = splitIndex !== -1 ? currentText.substring(splitIndex + fullMatchStr.length) : "";

                        btnId = document.createElement("button");
                        btnId.type = "button";
                        btnId.className = "btn tmt-btn-id";
                        btnId.dataset.id = idNum;
                        btnId.title = `Clic para copiar ID: ${idNum}`;
                        btnId.innerHTML = `
                            <span class="tmt-header-title">${prefix}</span>
                            <span class="tmt-id-badge">ID ${idNum}<span class="tmt-copy-icon" aria-hidden="true"></span></span>
                            ${suffix ? `<span class="tmt-header-suffix">${suffix}</span>` : ""}
                        `;

                        btnId.addEventListener("click", (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            copiarTextoAlPortapapeles(idNum, btnId, `¡ID ${idNum} copiado!`);
                        });

                        label.replaceWith(btnId);
                        console.log("TMT: Etiqueta label de ID sustituida por botón:", idNum);
                    }
                }
            }

            if (!btnId) return;

            // 2. Botón Matrícula (estilo placa europea sin estrellita) a la derecha del botón ID
            let btnPlaca = cabecera.querySelector(".tmt-btn-placa");
            if (plate) {
                if (!btnPlaca) {
                    btnPlaca = document.createElement("button");
                    btnPlaca.type = "button";
                    btnPlaca.className = "btn tmt-btn-placa";
                    btnId.insertAdjacentElement("afterend", btnPlaca);
                } else if (btnPlaca.previousElementSibling !== btnId) {
                    btnId.insertAdjacentElement("afterend", btnPlaca);
                }

                if (btnPlaca.dataset.tmtPlate !== plate) {
                    btnPlaca.dataset.tmtPlate = plate;
                    btnPlaca.title = `Clic para copiar matrícula: ${plate}`;
                    btnPlaca.innerHTML = `
                        <span class="tmt-placa-banda-eu" aria-hidden="true">
                            <span class="tmt-placa-pais">E</span>
                        </span>
                        <span class="tmt-placa-numero">${plate}</span>
                        <span class="tmt-copy-icon" aria-hidden="true"></span>
                    `;
                }
            } else if (btnPlaca) {
                btnPlaca.remove();
                btnPlaca = null;
            }

            // 3. Botón Ver en NG a la derecha del botón matrícula (o del botón ID si no hay placa)
            const anchorEl = btnPlaca || btnId;
            let btnNg = cabecera.querySelector(".tmt-btn-ver-ng");
            if (ngId) {
                if (!btnNg) {
                    btnNg = document.createElement("button");
                    btnNg.type = "button";
                    btnNg.className = "btn tmt-btn-ver-ng";
                    anchorEl.insertAdjacentElement("afterend", btnNg);
                } else if (btnNg.previousElementSibling !== anchorEl) {
                    anchorEl.insertAdjacentElement("afterend", btnNg);
                }

                if (btnNg.dataset.ngId !== ngId) {
                    btnNg.dataset.ngId = ngId;
                    btnNg.title = `Abrir orden ${ngId} en Northgate`;
                    btnNg.innerHTML = `
                        <span class="tmt-ng-num">${ngId}</span>
                        <span class="tmt-ng-icon" aria-hidden="true"></span>
                    `;
                }
            } else if (btnNg) {
                btnNg.remove();
            }

            // 4. Botón Teléfono a la derecha del botón Ver en NG (o del último botón existente)
            const anchorTel = btnNg || anchorEl;
            let btnTel = cabecera.querySelector(".tmt-btn-tel");
            if (telefono) {
                if (!btnTel) {
                    btnTel = document.createElement("button");
                    btnTel.type = "button";
                    btnTel.className = "btn tmt-btn-tel";
                    anchorTel.insertAdjacentElement("afterend", btnTel);
                } else if (btnTel.previousElementSibling !== anchorTel) {
                    anchorTel.insertAdjacentElement("afterend", btnTel);
                }

                if (btnTel.dataset.tel !== telefono) {
                    btnTel.dataset.tel = telefono;
                    btnTel.title = `Clic para copiar teléfono: ${telefono}`;
                    btnTel.innerHTML = `
                        <span class="tmt-tel-icon" aria-hidden="true"></span>
                        <span class="tmt-tel-num">${telefono}</span>
                    `;
                }
            } else if (btnTel) {
                btnTel.remove();
            }
        });
    }

    function copiarTextoAlPortapapeles(texto, element, mensajeFeedback) {
        if (!texto) return;
        
        function feedbackVisual() {
            if (element) {
                element.classList.add("tmt-copiado");
                setTimeout(() => {
                    element.classList.remove("tmt-copiado");
                }, 1200);
                mostrarFeedbackCopiado(element, mensajeFeedback || "¡Copiado!");
            }
            console.log("TMT: Copiado al portapapeles:", texto);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texto).then(feedbackVisual).catch(err => {
                console.warn("TMT: Error en navigator.clipboard, usando fallback:", err);
                if (fallbackCopy(texto)) {
                    feedbackVisual();
                }
            });
        } else {
            if (fallbackCopy(texto)) {
                feedbackVisual();
            }
        }
    }

    function fallbackCopy(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        textArea.setAttribute("readonly", "");
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        let successful = false;
        try {
            successful = document.execCommand('copy');
        } catch (err) {
            console.error("TMT: Error en fallback copy:", err);
        }
        document.body.removeChild(textArea);
        return successful;
    }

    function mostrarFeedbackCopiado(targetElement, texto) {
        if (!targetElement) return;
        const rect = targetElement.getBoundingClientRect();
        
        const bubble = document.createElement("div");
        bubble.className = "tmt-floating-feedback";
        bubble.textContent = texto;
        
        Object.assign(bubble.style, {
            position: "fixed",
            top: `${Math.max(10, rect.top - 28)}px`,
            left: `${rect.left + (rect.width / 2)}px`,
            transform: "translateX(-50%)",
            backgroundColor: "#1e293b",
            color: "#ffffff",
            padding: "3px 9px",
            borderRadius: "6px",
            fontSize: "12px",
            fontWeight: "600",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
            zIndex: "999999999",
            pointerEvents: "none",
            whiteSpace: "nowrap"
        });

        document.body.appendChild(bubble);

        setTimeout(() => {
            if (bubble.parentElement) {
                bubble.parentElement.removeChild(bubble);
            }
        }, 1200);
    }

    function programarActualizacionEspera() {
        if (programarEsperaRAF) return;
        programarEsperaRAF = requestAnimationFrame(() => {
            programarEsperaRAF = null;
            actualizarFilasEnEspera();
        });
    }

    function actualizarFilasEnEspera() {
        if (!resaltarEsperaHabilitado) {
            document.querySelectorAll('tr.tmt-fila-espera').forEach(tr => {
                tr.classList.remove('tmt-fila-espera');
                if (tr.dataset.tmtTitleEspera) {
                    tr.removeAttribute('title');
                    delete tr.dataset.tmtTitleEspera;
                }
            });
            return;
        }

        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
            const thead = table.querySelector('thead');
            if (!thead) return;

            const ths = Array.from(thead.querySelectorAll('th'));
            const esperaColIdx = ths.findIndex(th => {
                const text = th.textContent.trim().toLowerCase();
                return text === 'espera' || text.startsWith('espera') || text.includes('espera');
            });

            if (esperaColIdx === -1) return;

            const tbody = table.querySelector('tbody');
            if (!tbody) return;

            const rows = tbody.querySelectorAll('tr');
            rows.forEach(tr => {
                const cell = tr.children[esperaColIdx];
                if (!cell) return;

                // En NextFleet se usa Material Symbols 'check_box' cuando está marcada
                // y 'check_box_outline_blank' cuando no está marcada
                const cellText = cell.textContent || '';
                const tieneIconoCheck = cellText.includes('check_box') && !cellText.includes('check_box_outline_blank');
                const tieneInputCheck = !!cell.querySelector('input[type="checkbox"]:checked');
                const estaEnEspera = tieneIconoCheck || tieneInputCheck;

                if (estaEnEspera) {
                    if (!tr.classList.contains('tmt-fila-espera')) {
                        tr.classList.add('tmt-fila-espera');
                        if (!tr.getAttribute('title')) {
                            tr.setAttribute('title', 'Orden En Espera');
                            tr.dataset.tmtTitleEspera = 'true';
                        }
                    }
                } else {
                    if (tr.classList.contains('tmt-fila-espera')) {
                        tr.classList.remove('tmt-fila-espera');
                        if (tr.dataset.tmtTitleEspera) {
                            tr.removeAttribute('title');
                            delete tr.dataset.tmtTitleEspera;
                        }
                    }
                }
            });
        });
    }

    function inyectarBotonesCopiar() {
        // Encontrar los botones de Cancelar con los estilos específicos
        const botonesCancelar = Array.from(document.querySelectorAll('button.conBorde.sinSombra.btn.btn-lg'))
            .filter(btn => btn.textContent.trim() === 'Cancelar');

        botonesCancelar.forEach(btnCancelar => {
            // Buscar el contenedor padre de la ventana modal u offcanvas
            // Para asegurarnos de no inyectar en modales pequeños que se abren encima
            const contenedorPrincipal = btnCancelar.closest('.offcanvas, .modal, [role="dialog"], .modal-dialog, .p-sidebar, .p-dialog, .contenedor-Cuerpo-Ficha') || document.body;
            
            // Validar que dentro de este modal específico estemos en la vista de taller
            const textoContenedor = contenedorPrincipal.textContent.toLowerCase();
            const esVistaTaller = textoContenedor.includes('ver taller') || textoContenedor.includes('nombre comercial');

            if (!esVistaTaller) {
                return; // Si no es la ventana del taller, no inyectamos los botones
            }

            const container = btnCancelar.parentElement;
            // Evitar inyecciones duplicadas comprobando si ya existe nuestra clase custom
            if (container && !container.querySelector('.btn-tmt-copiar')) {
                // Cambiar el contenedor a display flex para poder usar gap y ordenar bien los botones
                container.style.display = 'flex';
                container.style.gap = '8px';
                
                const baseStyleStr = "height:43px !important; border-radius: 0px !important; color: white !important;";
                const classStr = "conBorde sinSombra btn btn-lg btn-tmt-copiar";

                const btnInline = document.createElement("button");
                btnInline.type = "button";
                btnInline.className = classStr;
                btnInline.style.cssText = baseStyleStr + " background-color: #0d6efd !important;";
                btnInline.textContent = "Copiar inline";
                btnInline.addEventListener("click", () => copiarDatos('inline', btnInline));

                const btnEspaciado = document.createElement("button");
                btnEspaciado.type = "button";
                btnEspaciado.className = classStr;
                btnEspaciado.style.cssText = baseStyleStr + " background-color: #198754 !important;";
                btnEspaciado.textContent = "Copiar espaciado";
                btnEspaciado.addEventListener("click", () => copiarDatos('espaciado', btnEspaciado));

                // Insertar los botones justo antes del botón de Cancelar
                container.insertBefore(btnInline, btnCancelar);
                container.insertBefore(btnEspaciado, btnCancelar);
            }
        });
    }

    function copiarDatos(modo, btnElement) {
        const nombreComercial = getFieldValue("Nombre comercial");
        const telefono = getFieldValue("Teléfono");
        const movil = getFieldValue("Móvil");
        const direccion = getFieldValue("Dirección");
        const cp = getFieldValue("C.P.");

        const telefonos = [telefono, movil].filter(t => t.length > 0).join(" - ");

        let textoCopiar = "";

        if (modo === "inline") {
            const partes = [nombreComercial];
            if (telefonos) partes.push(telefonos);
            textoCopiar = partes.join(" - ");
        } else if (modo === "espaciado") {
            const lineas = [];
            if (nombreComercial) lineas.push(nombreComercial);
            if (telefonos) lineas.push(telefonos);
            
            const direccionPartes = [];
            if (direccion) direccionPartes.push(direccion);
            if (cp) direccionPartes.push(cp);
            
            if (direccionPartes.length > 0) {
                lineas.push(direccionPartes.join(" - "));
            }
            
            textoCopiar = lineas.join("\n");
        }

        navigator.clipboard.writeText(textoCopiar).then(() => {
            const originalText = btnElement.textContent;
            btnElement.textContent = "¡Copiado!";
            
            // Esperar 400ms para que el usuario lea "¡Copiado!" y luego cerrar el panel
            setTimeout(() => {
                // Restaurar el texto original por si se vuelve a abrir el panel luego
                btnElement.textContent = originalText;
                
                // Buscar el botón Cancelar original dentro del mismo contenedor y hacerle clic
                const btnCancelar = btnElement.parentElement.querySelector('button.conBorde.sinSombra.btn.btn-lg:not(.btn-tmt-copiar)');
                if (btnCancelar && btnCancelar.textContent.trim() === 'Cancelar') {
                    btnCancelar.click();
                }
            }, 400);
        }).catch(err => {
            console.error('Error al copiar al portapapeles: ', err);
            const originalText = btnElement.textContent;
            btnElement.textContent = "Error";
            setTimeout(() => {
                btnElement.textContent = originalText;
            }, 1500);
        });
    }

    function getFieldValue(labelText) {
        const input = findFieldByLabelText(labelText);
        return input ? (input.value || '').trim() : '';
    }

     function crearBarra() {
        // Crear elemento principal de la barra
        barra = document.createElement("div");
        barra.id = "ng-cpt-barra-vertical";
        
        // Estilos CSS modernos con Glassmorphism y diseño premium (barra vertical a la derecha)
        Object.assign(barra.style, {
            position: "fixed",
            top: "0",
            right: "0",
            width: "280px",
            height: "100vh",
            backgroundColor: "rgba(18, 18, 18, 0.85)",
            backdropFilter: "blur(15px)",
            webkitBackdropFilter: "blur(15px)",
            borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow: "-4px 0 30px rgba(0, 0, 0, 0.4)",
            zIndex: "999999999",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
            justifyContent: "flex-start",
            padding: "20px 16px",
            boxSizing: "border-box",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
            transition: "all 0.3s ease",
            overflowY: "auto"
        });

        // Contenedor superior (solo botón de cerrar)
        const brandContainer = document.createElement("div");
        Object.assign(brandContainer.style, {
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: "15px",
            flexShrink: "0"
        });

        // Botón de cerrar barra
        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "&times;";
        closeBtn.title = "Cerrar barra";
        Object.assign(closeBtn.style, {
            background: "none",
            border: "none",
            color: "rgba(255, 255, 255, 0.5)",
            fontSize: "24px",
            cursor: "pointer",
            padding: "0 5px",
            lineHeight: "1",
            transition: "color 0.2s, transform 0.2s"
        });
        closeBtn.addEventListener("mouseenter", () => {
            closeBtn.style.color = "#FF4949";
            closeBtn.style.transform = "scale(1.1)";
        });
        closeBtn.addEventListener("mouseleave", () => {
            closeBtn.style.color = "rgba(255, 255, 255, 0.5)";
            closeBtn.style.transform = "scale(1)";
        });
        closeBtn.addEventListener("click", () => {
            toggleBarra();
        });

        brandContainer.appendChild(closeBtn);
        barra.appendChild(brandContainer);

        // Contenedor de botones rápidos
        const buttonsContainer = document.createElement("div");
        Object.assign(buttonsContainer.style, {
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            alignItems: "stretch",
            width: "100%",
            boxSizing: "border-box"
        });

        // Botón especial de configuración (Amarillo) - AL PRINCIPIO
        const configBtn = document.createElement("button");
        configBtn.textContent = "configuración";
        configBtn.title = "Abrir panel de configuración";
        Object.assign(configBtn.style, {
            background: "#FFCC00",
            border: "1px solid #E5B800",
            color: "#1a1a1a",
            borderRadius: "6px",
            padding: "10px 16px",
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
            width: "100%",
            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            outline: "none",
            boxSizing: "border-box"
        });

        configBtn.addEventListener("mouseenter", () => {
            configBtn.style.background = "#FFE066";
            configBtn.style.transform = "translateY(-2px)";
            configBtn.style.boxShadow = "0 4px 12px rgba(255, 204, 0, 0.3)";
        });

        configBtn.addEventListener("mouseleave", () => {
            configBtn.style.background = "#FFCC00";
            configBtn.style.transform = "translateY(0)";
            configBtn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
        });

        configBtn.addEventListener("click", () => {
            configBtn.style.transform = "scale(0.95)";
            setTimeout(() => {
                configBtn.style.transform = "translateY(-2px)";
            }, 100);
            chrome.runtime.sendMessage({ action: "openOptions" });
        });

        // Botón especial de AutoNG (Azul) - AL PRINCIPIO
        const autoNgBtn = document.createElement("button");
        autoNgBtn.textContent = "AutoNG";
        autoNgBtn.title = "Abrir orden de Northgate del texto seleccionado";
        Object.assign(autoNgBtn.style, {
            background: "#007bff",
            border: "1px solid #0056b3",
            color: "#ffffff",
            borderRadius: "6px",
            padding: "10px 16px",
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
            width: "100%",
            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            outline: "none",
            boxSizing: "border-box"
        });

        autoNgBtn.addEventListener("mouseenter", () => {
            autoNgBtn.style.background = "#3395ff";
            autoNgBtn.style.transform = "translateY(-2px)";
            autoNgBtn.style.boxShadow = "0 4px 12px rgba(0, 123, 255, 0.3)";
        });

        autoNgBtn.addEventListener("mouseleave", () => {
            autoNgBtn.style.background = "#007bff";
            autoNgBtn.style.transform = "translateY(0)";
            autoNgBtn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
        });

        autoNgBtn.addEventListener("click", () => {
            autoNgBtn.style.transform = "scale(0.95)";
            setTimeout(() => {
                autoNgBtn.style.transform = "translateY(-2px)";
            }, 100);
            if (window.runAutoNg) {
                window.runAutoNg();
            }
        });

        buttonsContainer.appendChild(configBtn);
        buttonsContainer.appendChild(autoNgBtn);

        // Separador visual
        const sep = document.createElement("div");
        Object.assign(sep.style, {
            height: "1px",
            background: "rgba(255, 255, 255, 0.1)",
            margin: "8px 0"
        });
        buttonsContainer.appendChild(sep);

        const grupos = {
            "ESENCIAL": ["matricula", "kms"],
            "NEUMATICOS": ["desgaste neum. delanteros", "desgaste neum. traseros", "pinchazo", "medidas"],
            "FRENOS": ["pastillas", "pastillas viejas", "discos", "discos viejos"],
            "VARIOS": ["diagnosis", "daño", "material viejo"]
        };

        for (const [nombreGrupo, botones] of Object.entries(grupos)) {
            const header = document.createElement("div");
            header.textContent = nombreGrupo;
            Object.assign(header.style, {
                fontSize: "11px",
                fontWeight: "bold",
                color: "rgba(255, 255, 255, 0.4)",
                letterSpacing: "1px",
                marginTop: "16px",
                marginBottom: "6px",
                textTransform: "uppercase"
            });
            buttonsContainer.appendChild(header);

            botones.forEach(id => {
                const btn = crearBotonRapido(id);
                buttonsContainer.appendChild(btn);
            });
        }

        barra.appendChild(buttonsContainer);

        // Inyectar en el documento
        document.documentElement.appendChild(barra);

        // Ajustar posición inicial a la izquierda del div si existe
        ajustarPosicionBarra();
        setTimeout(ajustarPosicionBarra, 100);
        setTimeout(ajustarPosicionBarra, 250);
        setTimeout(ajustarPosicionBarra, 500);

        // Inyectar animaciones clave por CSS
        inyectarEstilosAnimacion();

        // Mostrar notificación de bienvenida
        mostrarToast("Barra rápida activada");
    }

    function crearBotonRapido(id) {
        const btn = document.createElement("button");
        btn.textContent = id.toLowerCase();
        btn.dataset.id = id;

        // Estilos del botón (adaptados a layout vertical)
        Object.assign(btn.style, {
            background: "rgba(255, 255, 255, 0.05)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            color: "#e0e0e0",
            borderRadius: "6px",
            padding: "10px 16px",
            fontSize: "13px",
            fontWeight: "500",
            cursor: "pointer",
            width: "100%",
            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            outline: "none",
        });

        // Hover y Focus
        btn.addEventListener("mouseenter", () => {
            btn.style.background = "linear-gradient(135deg, rgba(0, 255, 135, 0.15) 0%, rgba(96, 239, 255, 0.15) 100%)";
            btn.style.borderColor = "rgba(96, 239, 255, 0.4)";
            btn.style.color = "#ffffff";
            btn.style.transform = "translateY(-2px)";
            btn.style.boxShadow = "0 4px 12px rgba(96, 239, 255, 0.15)";
        });

        btn.addEventListener("mouseleave", () => {
            btn.style.background = "rgba(255, 255, 255, 0.05)";
            btn.style.borderColor = "rgba(255, 255, 255, 0.12)";
            btn.style.color = "#e0e0e0";
            btn.style.transform = "translateY(0)";
            btn.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
        });

        btn.addEventListener("click", () => {
            btn.style.transform = "scale(0.95)";
            setTimeout(() => {
                btn.style.transform = "translateY(-2px)";
            }, 100);
            
            // Acción al hacer clic
            ejecutarAccionBoton(id);
        });

        return btn;
    }

    function ejecutarAccionBoton(id) {
        console.log(`Botón de texto rápido presionado: ${id}`);
        
        // Mantener texto a insertar estrictamente en minúsculas
        const labelText = id.toLowerCase();
        
        // Localizar los campos
        const inputNombre = findFieldByLabelText("Nombre del archivo");
        const inputDescripcion = findFieldByLabelText("Descripción del archivo");
        
        let inyectado = false;
        
        if (inputNombre) {
            setInputValue(inputNombre, labelText);
            inyectado = true;
        }
        if (inputDescripcion) {
            setInputValue(inputDescripcion, labelText);
            inyectado = true;
        }
        
        if (inyectado) {
            mostrarToast(`Texto '${labelText}' insertado correctamente`);
        } else {
            mostrarToast(`Error: No se encontraron los campos "Nombre del archivo" o "Descripción del archivo"`, true);
        }
        
        // Plegar la barra automáticamente al presionar
        toggleBarra();
    }

    // Encuentra un input/textarea en el DOM buscando un texto indicador/etiqueta cercano
    function findFieldByLabelText(labelText) {
        const stripAccents = str => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const cleanLabel = stripAccents(labelText.toLowerCase().trim().replace(":", ""));
        const elements = Array.from(document.querySelectorAll('label, span, div, p, td, th, h1, h2, h3, h4, h5, h6'));
        
        function esInputValido(el) {
            if (!el) return false;
            const tag = el.tagName.toLowerCase();
            if (tag === 'textarea') return true;
            if (tag === 'input') {
                const type = (el.getAttribute('type') || el.type || 'text').toLowerCase();
                const invalidTypes = ['file', 'hidden', 'submit', 'button', 'checkbox', 'radio', 'image', 'reset'];
                return !invalidTypes.includes(type);
            }
            return false;
        }

        function buscarInputValido(startNode) {
            if (!startNode) return null;
            if (esInputValido(startNode)) return startNode;
            const inside = Array.from(startNode.querySelectorAll('input, textarea')).find(esInputValido);
            if (inside) return inside;
            return null;
        }

        // 1. Primer barrido: buscar coincidencia exacta
        let target = elements.find(el => {
            const text = stripAccents(el.textContent.trim().toLowerCase().replace(":", ""));
            return text === cleanLabel;
        });
        
        // 2. Segundo barrido: buscar coincidencia por palabras clave
        if (!target) {
            const keywords = cleanLabel.split(/\s+/).filter(w => w.length > 2);
            if (keywords.length > 0) {
                target = elements.find(el => {
                    const text = stripAccents(el.textContent.trim().toLowerCase());
                    return keywords.every(kw => text.includes(kw));
                });
            }
        }

        if (!target) return null;

        // Si es un <label> con 'for', intentar obtener el input por ID
        if (target.tagName === "LABEL" && target.htmlFor) {
            const input = document.getElementById(target.htmlFor);
            if (esInputValido(input)) return input;
        }

        // Intentar buscar dentro de target o usar target si ya es un input válido
        const inputInsideTarget = buscarInputValido(target);
        if (inputInsideTarget) return inputInsideTarget;

        // Buscar input en hermanos siguientes
        let sibling = target.nextElementSibling;
        while (sibling) {
            const found = buscarInputValido(sibling);
            if (found) return found;
            sibling = sibling.nextElementSibling;
        }

        // Buscar subiendo y explorando la jerarquía cercana (hasta 3 niveles arriba)
        let parent = target.parentElement;
        for (let i = 0; i < 3 && parent; i++) {
            const inputs = Array.from(parent.querySelectorAll('input, textarea')).filter(esInputValido);
            if (inputs.length > 0) {
                const found = inputs.find(inp => inp !== target);
                if (found) return found;
            }
            
            // Buscar en hermanos del padre
            let parentSibling = parent.nextElementSibling;
            while (parentSibling) {
                const found = buscarInputValido(parentSibling);
                if (found) return found;
                parentSibling = parentSibling.nextElementSibling;
            }
            parent = parent.parentElement;
        }

        return null;
    }

    // Modifica de forma segura el valor del input/textarea forzando la actualización en frameworks SPA (React/Angular/Vue)
    function setInputValue(input, value) {
        if (!input) return;
        
        try {
            // Detectar el prototipo correcto para simular la entrada nativa de usuario
            const prototype = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
            
            if (descriptor && descriptor.set) {
                descriptor.set.call(input, value);
            } else {
                input.value = value;
            }
            
            // Disparar eventos nativos para que React, Vue o Angular actualicen sus estados bindings
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) {
            console.error("Error setting input value via prototype descriptor", e);
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }

    // Sistema de notificaciones integradas (Toast) - Deshabilitado a petición del usuario
    function mostrarToast(mensaje, esError = false) {
        // No-op: las notificaciones visuales han sido desactivadas para no molestar la UI nativa.
    }

    function inyectarEstilosAnimacion() {
        if (document.getElementById("ng-cpt-keyframe-styles")) return;

        const styles = document.createElement("style");
        styles.id = "ng-cpt-keyframe-styles";
        styles.textContent = `
            @keyframes pulse {
                0% { transform: scale(1); opacity: 0.8; }
                100% { transform: scale(1.15); opacity: 1; }
            }
        `;
        document.head.appendChild(styles);
    }

    return {
        init: init,
        toggle: toggleBarra
    };
})();
