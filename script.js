function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

const Editor = {
    config: {
        debounceDelay: 300,
        mathJaxProcessing: false,
        localStorageKey: 'markdownEditorContent',
        autosaveInterval: 5000,
    },
    state: {
        currentMathEngine: 'katex',
        currentMarkdownEngine: 'markdown-it',
        customCssVisible: false,
        lastText: '',
        lastRenderedHTML: '',
        mathJaxRunning: false,
        libsReady: {
            mathJax: false,
            katex: false,
            mermaid: false,
            hljs: false,
            markdownIt: false,
            marked: false
        },
        isInitialized: false,
        mathPlaceholders: {},
        isMobileView: false,
        currentMobilePane: 'editor',
        lastSavedTime: null,
    },
    elements: {
        textarea: null,
        previewContent: null,
        previewPane: null,
        toolbar: null,
        markdownItBtn: null,
        markedBtn: null,
        mathJaxBtn: null,
        kaTeXBtn: null,
        downloadBtn: null,
        downloadPdfBtn: null,
        downloadMdBtn: null,
        downloadTxtBtn: null,
        toggleCssBtn: null,
        customCssContainer: null,
        customCssInput: null,
        applyCssBtn: null,
        closeCssBtn: null,
        customStyleTag: null,
        buffer: null,
        showEditorBtn: null,
        showPreviewBtn: null,
        autosaveIndicator: null,
    },
    markdownItInstance: null,
    markedInstance: null,
    debouncedUpdate: null,
    autosaveTimer: null,

    Init: function () {
        this.getElements();
        this.createBufferElement();
        this.setupMarkdownRenderers();
        this.InitializeMermaid();
        this.debouncedUpdate = debounce(this.UpdatePreview.bind(this), this.config.debounceDelay);
        this.setupEventListeners();
        this.initializeResponsiveUI();
        this.setupAutosave();
        this.LoadFromLocalStorage();
        this.state.lastText = this.elements.textarea.value;

        // Immediate initial rendering (don't wait for library check)
        if (this.elements.textarea.value) {
            this.UpdatePreview(true); // Force update regardless of lastText comparison
        }

        this.CheckLibraries();
    },

    getElements: function () {
        this.elements.textarea = document.getElementById("markdown-input");
        this.elements.previewContent = document.getElementById("preview-content");
        this.elements.previewPane = document.getElementById("preview-pane");
        this.elements.toolbar = document.querySelector(".toolbar");
        this.elements.markdownItBtn = document.getElementById("btn-markdown-it");
        this.elements.markedBtn = document.getElementById("btn-marked");
        this.elements.mathJaxBtn = document.getElementById("btn-mathjax");
        this.elements.kaTeXBtn = document.getElementById("btn-katex");
        this.elements.downloadBtn = document.getElementById("btn-download");
        this.elements.downloadPdfBtn = document.getElementById("btn-download-pdf");
        this.elements.downloadMdBtn = document.getElementById("btn-download-md");
        this.elements.downloadTxtBtn = document.getElementById("btn-download-txt");
        this.elements.toggleCssBtn = document.getElementById("btn-toggle-css");
        this.elements.customCssContainer = document.getElementById("custom-css-container");
        this.elements.customCssInput = document.getElementById("custom-css-input");
        this.elements.applyCssBtn = document.getElementById("btn-apply-css");
        this.elements.closeCssBtn = document.getElementById("btn-close-css");
        this.elements.customStyleTag = document.getElementById("custom-styles-output");
        this.elements.showEditorBtn = document.getElementById("btn-show-editor");
        this.elements.showPreviewBtn = document.getElementById("btn-show-preview");
        this.elements.autosaveIndicator = document.getElementById("autosave-indicator");

        if (!this.elements.textarea || !this.elements.previewContent || !this.elements.previewPane) {
            console.error("Critical elements not found. Aborting initialization.");
            alert("Error initializing editor: Required elements missing.");
            return false;
        }
        return true;
    },

    createBufferElement: function () {
        this.elements.buffer = document.createElement('div');
        this.elements.buffer.id = "mathjax-buffer";
        this.elements.buffer.style.display = 'none';
        document.body.appendChild(this.elements.buffer);
    },

    setupMarkdownRenderers: function () {
        if (typeof markdownit !== 'function') {
            console.error("markdown-it library not loaded.");
            alert("Error initializing editor: markdown-it library failed to load.");
            return false;
        } else {
            this.state.libsReady.markdownIt = true;
        }

        this.markdownItInstance = window.markdownit({
            html: true,
            linkify: true,
            typographer: true,
            highlight: (str, lang) => this.handleCodeHighlighting(str, lang)
        });

        if (typeof markdownitFootnote === 'function') {
            this.markdownItInstance = this.markdownItInstance.use(markdownitFootnote);
        }

        if (typeof marked !== 'undefined') {
            this.state.libsReady.marked = true;
            marked.setOptions({
                renderer: new marked.Renderer(),
                highlight: (code, lang) => this.handleCodeHighlighting(code, lang),
                pedantic: false,
                gfm: true,
                breaks: false,
                sanitize: false,
                smartLists: true,
                smartypants: false,
                xhtml: false
            });
            this.markedInstance = marked;
        }
        return true;
    },

    handleCodeHighlighting: function (code, lang) {
        if (lang && lang === 'mermaid') {
            return `<pre class="mermaid">${this.EscapeHtml(code)}</pre>`;
        }
        if (lang && typeof hljs !== 'undefined' && hljs.getLanguage(lang)) {
            try {
                const highlightedCode = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
                return `<pre class="hljs language-${lang}"><code>${highlightedCode}</code></pre>`;
            } catch (e) {
                console.warn("Highlight.js error:", e);
            }
        }
        return `<pre class="hljs"><code>${this.markdownItInstance?.utils.escapeHtml(code) || code}</code></pre>`;
    },
 // Detect lines with LaTeX even without brackets nd wrap them in $$...$$ 🤔
    processLatexPaste: function(text) {
        const lines = text.split('\n');
        return lines.map(line => {
            const trimmed = line.trim();
            if (trimmed && 
                !trimmed.startsWith('$$') && 
                !trimmed.startsWith('\\[') && 
                !trimmed.endsWith('$$') && 
                !trimmed.endsWith('\\]') && 
                !/\$.*\$/.test(trimmed) && // Check if line already has $ delimiters
                !/\\[()\[\]]/.test(trimmed) && // Check if line already has \( \) or \[ \] delimiters
                /\\[a-zA-Z]+\b/.test(trimmed)) { // Has LaTeX commands
                return `$$${trimmed}$$`;
            }
            return line;
        }).join('\n');
    },

    setupEventListeners: function () {
        this.elements.textarea.addEventListener('input', () => {
            this.SaveToLocalStorage();
            this.debouncedUpdate();
        });

        // Replace the existing paste listener with this
        this.elements.textarea.addEventListener('paste', (e) => {
            const clipboardData = e.clipboardData || window.clipboardData;
            const pastedText = clipboardData.getData('text/plain');
            const processedText = this.processLatexPaste(pastedText);
            
            // Prevent default paste and insert modified text
            e.preventDefault();
            document.execCommand('insertText', false, processedText);
            
            // Trigger update
            setTimeout(() => this.UpdatePreview(true), 0);
        });

        this.elements.markdownItBtn.addEventListener('click', () => this.SetMarkdownEngine('markdown-it'));
        this.elements.markedBtn.addEventListener('click', () => this.SetMarkdownEngine('marked'));
        this.elements.mathJaxBtn.addEventListener('click', () => this.SetMathEngine('mathjax'));
        this.elements.kaTeXBtn.addEventListener('click', () => this.SetMathEngine('katex'));
        this.elements.downloadPdfBtn.addEventListener('click', () => this.DownloadAs('pdf'));
        this.elements.downloadMdBtn.addEventListener('click', () => this.DownloadAs('md'));
        this.elements.downloadTxtBtn.addEventListener('click', () => this.DownloadAs('txt'));
        this.elements.toggleCssBtn.addEventListener('click', this.ToggleCustomCSS.bind(this));
        this.elements.applyCssBtn.addEventListener('click', this.ApplyCustomCSS.bind(this));
        this.elements.closeCssBtn.addEventListener('click', this.ToggleCustomCSS.bind(this));
    },

    initializeResponsiveUI: function () {
        this.CheckMobileView();
        window.addEventListener('resize', this.CheckMobileView.bind(this));

        if (this.elements.showEditorBtn && this.elements.showPreviewBtn) {
            this.elements.showEditorBtn.addEventListener('click', () => this.SetMobilePane('editor'));
            this.elements.showPreviewBtn.addEventListener('click', () => this.SetMobilePane('preview'));
        }

        this.ConnectMobileMenuButtons();
    },

    setupAutosave: function () {
        this.autosaveTimer = setInterval(() => {
            if (this.elements.textarea.value !== this.state.lastText) {
                this.SaveToLocalStorage();
                this.state.lastText = this.elements.textarea.value;
            }
        }, this.config.autosaveInterval);

        if (this.elements.autosaveIndicator) {
            this.updateAutosaveIndicator();
        }
    },

    updateAutosaveIndicator: function () {
        if (!this.elements.autosaveIndicator) return;

        const now = new Date();
        if (this.state.lastSavedTime) {
            const secondsAgo = Math.floor((now - this.state.lastSavedTime) / 1000);
            if (secondsAgo < 60) {
                this.elements.autosaveIndicator.textContent = `Saved ${secondsAgo}s ago`;
            } else {
                const minutesAgo = Math.floor(secondsAgo / 60);
                this.elements.autosaveIndicator.textContent = `Saved ${minutesAgo}m ago`;
            }
        } else {
            this.elements.autosaveIndicator.textContent = "Auto-saved";
        }
    },

    CheckLibraries: function () {
        if (typeof MathJax !== 'undefined' && MathJax.Hub) {
            this.state.libsReady.mathJax = true;
        }

        if (typeof katex !== 'undefined' && typeof renderMathInElement === 'function') {
            this.state.libsReady.katex = true;
        }

        if (typeof mermaid !== 'undefined' && typeof mermaid.mermaidAPI !== 'undefined') {
            this.state.libsReady.mermaid = true;
        }

        if (typeof hljs !== 'undefined') {
            this.state.libsReady.hljs = true;
        }

        if (this.AllLibrariesReady() && !this.state.isInitialized) {
            this.state.isInitialized = true;
            this.UpdatePreview(true); // Force update to ensure preview reflects current content
        } else if (!this.state.isInitialized) {
            setTimeout(() => this.CheckLibraries(), 300);
        }
    },

    AllLibrariesReady: function () {
        return (this.state.libsReady.markdownIt || this.state.libsReady.marked) &&
            (this.state.libsReady.mathJax || this.state.libsReady.katex);
    },

    InitializeMermaid: function () {
        if (typeof mermaid !== 'undefined') {
            try {
                mermaid.initialize({
                    startOnLoad: false,
                    theme: 'default',
                    securityLevel: 'loose',
                    fontFamily: 'sans-serif',
                    logLevel: 'fatal',
                });
                this.state.libsReady.mermaid = true;
            } catch (e) {
                console.error("Failed to initialize Mermaid:", e);
            }
        }
    },

    UpdatePreview: function (force = false) {
        const text = this.elements.textarea.value;
        if (!force && text === this.state.lastText && this.state.lastText !== '') return;

        try {
            const scrollPercent = this.elements.previewPane.scrollTop /
                (this.elements.previewPane.scrollHeight - this.elements.previewPane.clientHeight);

            if (this.state.currentMarkdownEngine === 'markdown-it' && this.state.libsReady.markdownIt) {
                this.state.lastRenderedHTML = this.markdownItInstance.render(text);
                this.elements.previewContent.innerHTML = this.state.lastRenderedHTML;
                this.ProcessMath();
                this.ProcessMermaid();
            }
            else if (this.state.currentMarkdownEngine === 'marked' && this.state.libsReady.marked) {
                this.RenderWithMarked(text, scrollPercent);
                return;
            }
            else {
                // Try to use any available engine rather than showing error
                if (this.state.libsReady.markdownIt) {
                    this.state.lastRenderedHTML = this.markdownItInstance.render(text);
                    this.elements.previewContent.innerHTML = this.state.lastRenderedHTML;
                    this.ProcessMath();
                    this.ProcessMermaid();
                } else if (this.state.libsReady.marked) {
                    this.RenderWithMarked(text, scrollPercent);
                    return;
                } else {
                    console.error("No valid markdown engine available");
                    this.elements.previewContent.innerHTML = '<p>Error: No valid markdown renderer available</p>';
                    return;
                }
            }

            this._restoreScrollPosition(scrollPercent);
            this.state.lastText = text;

        } catch (err) {
            console.error("Error during rendering:", err);
            this.elements.previewContent.innerHTML = `<p style='color: red; font-weight: bold;'>Error rendering preview. Check console for details.</p><pre>${this.EscapeHtml(err.stack || err.message)}</pre>`;
        }
    },

    RenderWithMarked: function (text, scrollPercent) {
        if (!this.elements.buffer) {
            this.createBufferElement();
        }

        if (this.state.currentMathEngine === 'mathjax') {
            try {
                if (!this.state.mathJaxRunning) {
                    this.state.mathJaxRunning = true;
                    const escapedText = this.EscapeHtml(text);
                    this.elements.buffer.innerHTML = escapedText;

                    MathJax.Hub.Queue(
                        ["resetEquationNumbers", MathJax.InputJax.TeX],
                        ["Typeset", MathJax.Hub, this.elements.buffer],
                        () => {
                            try {
                                const mathJaxProcessedHtml = this.elements.buffer.innerHTML;
                                const finalHtml = marked.parse(mathJaxProcessedHtml);
                                this.elements.previewContent.innerHTML = finalHtml;
                                this.ProcessMermaid();
                                this._restoreScrollPosition(scrollPercent);
                                this.state.lastText = text;
                            } catch (err) {
                                console.error("Error updating preview after MathJax:", err);
                                this.elements.previewContent.innerHTML = `<p style='color: red;'>Error updating preview with MathJax.</p>`;
                            } finally {
                                this.state.mathJaxRunning = false;
                            }
                        }
                    );
                }
            } catch (err) {
                console.error("Error during MathJax+marked rendering:", err);
                this.elements.previewContent.innerHTML = `<p style='color: red;'>Error rendering preview with MathJax.</p>`;
                this.state.mathJaxRunning = false;
            }
        } else {
            try {
                const html = marked.parse(text);
                this.elements.previewContent.innerHTML = html;

                if (this.state.currentMathEngine === 'katex') {
                    this.ProcessMath();
                }

                this.ProcessMermaid();
                this._restoreScrollPosition(scrollPercent);
                this.state.lastText = text;
            } catch (err) {
                console.error("Error during standard marked rendering:", err);
                this.elements.previewContent.innerHTML = `<p style='color: red;'>Error rendering preview with marked.</p>`;
            }
        }
    },

    _restoreScrollPosition: function (scrollPercent) {
        requestAnimationFrame(() => {
            const newScrollHeight = this.elements.previewPane.scrollHeight;
            const newScrollTop = scrollPercent * (newScrollHeight - this.elements.previewPane.clientHeight);
            if (isFinite(scrollPercent) && newScrollHeight > this.elements.previewPane.clientHeight) {
                this.elements.previewPane.scrollTop = newScrollTop;
            } else {
                this.elements.previewPane.scrollTop = 0;
            }
        });
    },

    ProcessMath: function () {
        if (!this.elements.previewContent) return;

        try {
            if (this.state.currentMathEngine === 'katex' && this.state.libsReady.katex) {
                if (typeof renderMathInElement === 'function') {
                    renderMathInElement(this.elements.previewContent, {
                        delimiters: [
                            { left: "$$", right: "$$", display: true },
                            { left: "\\[", right: "\\]", display: true },
                            { left: "$", right: "$", display: false },
                            { left: "\\(", right: "\\)", display: false }
                        ],
                        throwOnError: false
                    });
                }
            } else if (this.state.currentMathEngine === 'mathjax' && this.state.libsReady.mathJax) {
                if (typeof MathJax !== 'undefined' && MathJax.Hub) {
                    if (this.config.mathJaxProcessing) return;
                    this.config.mathJaxProcessing = true;
                    MathJax.Hub.Queue(
                        ["Typeset", MathJax.Hub, this.elements.previewContent],
                        () => { this.config.mathJaxProcessing = false; }
                    );
                }
            }
        } catch (err) {
            console.error(`Error processing math:`, err);
            const errorDiv = document.createElement('div');
            errorDiv.style.color = 'orange';
            errorDiv.textContent = `Math processing error. Check console.`;
            this.elements.previewContent.prepend(errorDiv);
        }
    },

    ProcessMermaid: function () {
        if (typeof mermaid === 'undefined' || !this.elements.previewContent) return;

        const mermaidBlocks = this.elements.previewContent.querySelectorAll('pre.mermaid');
        if (mermaidBlocks.length === 0) return;

        try {
            mermaid.init(undefined, mermaidBlocks);
        } catch (err) {
            console.error("Error initializing mermaid diagrams:", err);
            mermaidBlocks.forEach((block, index) => {
                try {
                    const container = document.createElement('div');
                    container.className = 'mermaid-diagram';
                    const code = this.UnescapeHtml(block.textContent || "").trim();
                    container.textContent = code;

                    if (block.parentNode) {
                        block.parentNode.replaceChild(container, block);
                        mermaid.init(undefined, container);
                    }
                } catch (blockErr) {
                    console.error(`Error rendering mermaid block ${index}:`, blockErr);
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'mermaid-error';
                    errorDiv.innerHTML = `
                        <strong>Mermaid Diagram Error</strong><br>
                        <p>There was a problem rendering this diagram. Check your syntax.</p>
                        <details>
                            <summary>View Error Details</summary>
                            <pre>${this.EscapeHtml(blockErr.message || String(blockErr))}</pre>
                        </details>
                        <details>
                            <summary>View Diagram Source</summary>
                            <pre>${this.EscapeHtml(block.textContent || "")}</pre>
                        </details>
                    `;
                    if (block.parentNode) {
                        block.parentNode.replaceChild(errorDiv, block);
                    }
                }
            });
        }
    },

    CheckMobileView: function () {
        const wasMobile = this.state.isMobileView;
        this.state.isMobileView = window.innerWidth <= 768;

        if (wasMobile !== this.state.isMobileView) {
            if (this.state.isMobileView) {
                this.SetMobilePane(this.state.currentMobilePane);
            } else {
                if (this.elements.textarea && this.elements.textarea.parentElement) {
                    this.elements.textarea.parentElement.style.display = 'flex';
                }
                if (this.elements.previewPane) {
                    this.elements.previewPane.style.display = 'flex';
                }
            }
        }
    },

    SetMobilePane: function (pane) {
        if (!this.state.isMobileView) return;

        this.state.currentMobilePane = pane;

        if (this.elements.showEditorBtn && this.elements.showPreviewBtn) {
            this.elements.showEditorBtn.classList.toggle('active', pane === 'editor');
            this.elements.showPreviewBtn.classList.toggle('active', pane === 'preview');
        }

        if (this.elements.textarea && this.elements.textarea.parentElement) {
            this.elements.textarea.parentElement.style.display = pane === 'editor' ? 'flex' : 'none';
        }

        if (this.elements.previewPane) {
            this.elements.previewPane.style.display = pane === 'preview' ? 'flex' : 'none';
        }

        if (pane === 'preview') {
            this.UpdatePreview();
        }
    },

    SetMarkdownEngine: function (engine) {
        if (engine !== this.state.currentMarkdownEngine) {
            this.state.currentMarkdownEngine = engine;
            this.elements.markdownItBtn.classList.toggle('active', engine === 'markdown-it');
            this.elements.markedBtn.classList.toggle('active', engine === 'marked');
            
            // Update mobile buttons
            const mobileMarkdownItBtn = document.getElementById('btn-markdown-it-mobile');
            const mobileMarkedBtn = document.getElementById('btn-marked-mobile');
            if (mobileMarkdownItBtn && mobileMarkedBtn) {
                mobileMarkdownItBtn.classList.toggle('active', engine === 'markdown-it');
                mobileMarkedBtn.classList.toggle('active', engine === 'marked');
            }
            
            this.state.lastText = '';
            this.UpdatePreview();
        }
    },

    SetMathEngine: function (engine) {
        if (engine !== this.state.currentMathEngine) {
            this.state.currentMathEngine = engine;
            this.elements.mathJaxBtn.classList.toggle('active', engine === 'mathjax');
            this.elements.kaTeXBtn.classList.toggle('active', engine === 'katex');
            
            // Update mobile buttons
            const mobileMathJaxBtn = document.getElementById('btn-mathjax-mobile');
            const mobileKaTeXBtn = document.getElementById('btn-katex-mobile');
            if (mobileMathJaxBtn && mobileKaTeXBtn) {
                mobileMathJaxBtn.classList.toggle('active', engine === 'mathjax');
                mobileKaTeXBtn.classList.toggle('active', engine === 'katex');
            }
            
            this.state.lastText = '';
            this.UpdatePreview();
        }
    },

    ToggleCustomCSS: function () {
        this.state.customCssVisible = !this.state.customCssVisible;
        this.elements.customCssContainer.style.display = this.state.customCssVisible ? 'flex' : 'none';
        this.elements.toggleCssBtn.textContent = this.state.customCssVisible ? 'Hide CSS' : 'Custom CSS';

        if (this.state.customCssVisible) {
            try {
                const savedCSS = localStorage.getItem('markdownEditorCustomCSS');
                if (savedCSS && this.elements.customCssInput.value === '') {
                    this.elements.customCssInput.value = savedCSS;
                    this.elements.customStyleTag.innerHTML = savedCSS;
                }
            } catch (err) {
                console.error("Error loading custom CSS:", err);
            }
            this.elements.customCssInput.focus();
        }
    },

    ApplyCustomCSS: function () {
        const css = this.elements.customCssInput.value;
        this.elements.customStyleTag.innerHTML = css;
        try {
            localStorage.setItem('markdownEditorCustomCSS', css);
        } catch (err) {
            console.error("Error saving custom CSS:", err);
        }
    },

    DownloadAs: function (format) {
        const text = this.state.lastText;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `markdown_export_${timestamp}.${format}`;

        if (format === 'txt' || format === 'md') {
            const blob = new Blob([text], { type: format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' });
            this._triggerDownload(blob, filename);
        } else if (format === 'pdf') {
            this._generatePdf(filename);
        }
    },

    _triggerDownload: function (blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    },

    _generatePdf: async function (filename) {
        if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
            alert('PDF generation libraries not loaded yet. Please try again in a moment.');
            return;
        }

        const previewContent = this.elements.previewContent;
        if (!previewContent) return;

        const downloadBtn = this.elements.downloadPdfBtn || document.getElementById('btn-download-pdf-mobile');
        if (downloadBtn) {
            downloadBtn.textContent = 'Generating...';
            downloadBtn.disabled = true;
        }

        try {
            const printContainer = document.createElement('div');
            printContainer.className = 'pdf-container';
            printContainer.innerHTML = previewContent.innerHTML;
            printContainer.style.width = '650px';
            printContainer.style.backgroundColor = 'white';
            printContainer.style.color = 'black';
            printContainer.style.padding = '40px';
            printContainer.style.fontSize = '12pt';
            printContainer.style.lineHeight = '1.4';
            printContainer.style.position = 'absolute';
            printContainer.style.top = '0';
            printContainer.style.left = '-9999px';
            document.body.appendChild(printContainer);

            if (this.state.currentMathEngine === 'mathjax' && typeof MathJax !== 'undefined') {
                await new Promise((resolve) => {
                    MathJax.Hub.Queue(["Typeset", MathJax.Hub, printContainer], resolve);
                });
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            const codeBlocks = printContainer.querySelectorAll('pre, code');
            codeBlocks.forEach(block => {
                block.style.fontSize = '10pt';
                block.style.overflow = 'hidden';
                block.style.whiteSpace = 'pre-wrap';
                block.style.wordWrap = 'break-word';
                block.style.border = '1px solid #ccc';
                block.style.padding = '8px';
                block.style.borderRadius = '3px';
                block.style.backgroundColor = '#f8f8f8';
            });

            const { jsPDF } = jspdf;
            const pdf = new jsPDF('p', 'pt', 'a4');
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 40;
            const contentWidth = pageWidth - (margin * 2);
            const pdfOptions = {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                backgroundColor: '#ffffff',
                logging: false,
            };

            const canvas = await html2canvas(printContainer, pdfOptions);
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const imgWidth = contentWidth;
            const ratio = canvas.height / canvas.width;
            const imgHeight = contentWidth * ratio;

            const pageInnerHeight = pageHeight - (margin * 2);
            let heightLeft = imgHeight;
            let position = margin;
            let pageCount = 1;

            pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
            heightLeft -= pageInnerHeight;

            while (heightLeft > 0) {
                pageCount++;
                position = heightLeft - imgHeight + margin;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
                heightLeft -= pageInnerHeight;
            }

            pdf.save(filename);
            document.body.removeChild(printContainer);

        } catch (error) {
            console.error("Error generating PDF:", error);
            alert(`Error generating PDF: ${error.message || 'Unknown error'}`);
        } finally {
            if (downloadBtn) {
                downloadBtn.textContent = 'Save as PDF';
                downloadBtn.disabled = false;
            }
        }
    },

    EscapeHtml: function (str) {
        if (!str) return "";
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    UnescapeHtml: function (str) {
        if (!str) return "";
        try {
            const doc = new DOMParser().parseFromString(str, 'text/html');
            return doc.documentElement.textContent || "";
        } catch (e) {
            console.error("Error unescaping HTML:", e);
            return str;
        }
    },

    ConnectMobileMenuButtons: function () {
        const mobileButtons = {
            markdownIt: document.getElementById('btn-markdown-it-mobile'),
            marked: document.getElementById('btn-marked-mobile'),
            mathjax: document.getElementById('btn-mathjax-mobile'),
            katex: document.getElementById('btn-katex-mobile'),
            downloadPdf: document.getElementById('btn-download-pdf-mobile'),
            downloadMd: document.getElementById('btn-download-md-mobile'),
            downloadTxt: document.getElementById('btn-download-txt-mobile'),
            toggleCss: document.getElementById('btn-toggle-css-mobile'),
        };

        const mobileMenu = document.getElementById('mobile-menu');
        const hamburgerBtn = document.getElementById('mobile-hamburger');

        const closeMenu = () => {
            if (mobileMenu && hamburgerBtn) {
                mobileMenu.classList.remove('open');
                hamburgerBtn.classList.remove('active');
            }
        };

        if (mobileButtons.markdownIt && mobileButtons.marked) {
            mobileButtons.markdownIt.addEventListener('click', () => {
                this.SetMarkdownEngine('markdown-it');
                closeMenu();
            });

            mobileButtons.marked.addEventListener('click', () => {
                this.SetMarkdownEngine('marked');
                closeMenu();
            });
        }

        if (mobileButtons.mathjax && mobileButtons.katex) {
            mobileButtons.mathjax.addEventListener('click', () => {
                this.SetMathEngine('mathjax');
                closeMenu();
            });

            mobileButtons.katex.addEventListener('click', () => {
                this.SetMathEngine('katex');
                closeMenu();
            });
        }

        if (mobileButtons.downloadPdf) {
            mobileButtons.downloadPdf.addEventListener('click', () => {
                this.DownloadAs('pdf');
                closeMenu();
            });
        }

        if (mobileButtons.downloadMd) {
            mobileButtons.downloadMd.addEventListener('click', () => {
                this.DownloadAs('md');
                closeMenu();
            });
        }

        if (mobileButtons.downloadTxt) {
            mobileButtons.downloadTxt.addEventListener('click', () => {
                this.DownloadAs('txt');
                closeMenu();
            });
        }

        if (mobileButtons.toggleCss) {
            mobileButtons.toggleCss.addEventListener('click', () => {
                this.ToggleCustomCSS();
                closeMenu();
            });
        }
    },

    SaveToLocalStorage: function () {
        try {
            const content = this.elements.textarea.value;
            localStorage.setItem(this.config.localStorageKey, content);
            this.state.lastSavedTime = new Date();
            this.updateAutosaveIndicator();
        } catch (err) {
            console.error("Error saving to localStorage:", err);
        }
    },

    LoadFromLocalStorage: function () {
        try {
            const savedContent = localStorage.getItem(this.config.localStorageKey);
            if (savedContent) {
                this.elements.textarea.value = savedContent;
                // We'll update the preview in Init after setting lastText
            }

            const savedCSS = localStorage.getItem('markdownEditorCustomCSS');
            if (savedCSS && this.elements.customStyleTag) {
                this.elements.customStyleTag.innerHTML = savedCSS;
                if (this.elements.customCssInput) {
                    this.elements.customCssInput.value = savedCSS;
                }
            }
        } catch (err) {
            console.error("Error loading from localStorage:", err);
        }
    },
};

document.addEventListener('DOMContentLoaded', () => {
    Editor.Init();
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
        if (!Editor.state.isInitialized) {
            Editor.Init();
        }
    }, 1);
}