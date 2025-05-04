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
        debounceDelay: 300, // ms delay for preview update
        mathJaxProcessing: false, // Flag to prevent concurrent MathJax runs
    },
    state: {
        currentMathEngine: 'mathjax', // Default math engine
        currentMarkdownEngine: 'markdown-it', // Default markdown engine
        customCssVisible: false,
        lastText: '', // Store last processed text to avoid unnecessary re-renders
        lastRenderedHTML: '', // Store last raw HTML from markdown-it
        mathJaxRunning: false, // Flag to prevent concurrent MathJax runs with marked engine
        libsReady: {
            mathJax: false,
            katex: false,
            mermaid: false,
            hljs: false,
            markdownIt: false,
            marked: false
        },
        isInitialized: false,
        mathPlaceholders: {}, // Store math placeholders and their processed versions
        isMobileView: false,
        currentMobilePane: 'editor', // 'editor' or 'preview'
    },
    elements: {
        textarea: null,
        previewContent: null, // The DIV where content is rendered
        previewPane: null, // The scrolling parent pane
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
        buffer: null, // Hidden div for MathJax preprocessing with marked
        showEditorBtn: null,
        showPreviewBtn: null,
    },
    markdownItInstance: null,
    markedInstance: null,
    debouncedUpdate: null,

    Init: function () {
        // 1. Get elements
        this.elements.textarea = document.getElementById("markdown-input");
        this.elements.previewContent = document.getElementById("preview-content");
        this.elements.previewPane = document.getElementById("preview-pane"); // Get parent pane
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

        if (!this.elements.textarea || !this.elements.previewContent || !this.elements.previewPane) {
            console.error("Critical elements not found. Aborting initialization.");
            alert("Error initializing editor: Required elements missing.");
            return;
        }

        // Create hidden buffer element for MathJax preprocessing with marked
        this.elements.buffer = document.createElement('div');
        this.elements.buffer.id = "mathjax-buffer";
        this.elements.buffer.style.display = 'none';
        document.body.appendChild(this.elements.buffer);

        // 2. Setup Markdown renderers
        // Setup markdown-it
        if (typeof markdownit !== 'function') {
            console.error("markdown-it library not loaded.");
            alert("Error initializing editor: markdown-it library failed to load.");
            return;
        } else {
            this.state.libsReady.markdownIt = true;
        }

        this.markdownItInstance = window.markdownit({
            html: true, // Allow HTML tags
            linkify: true, // Autoconvert URL-like text to links
            typographer: true, // Enable smart quotes, dashes, etc.
            highlight: function (str, lang) {
                if (lang && lang === 'mermaid') {
                    // Wrap mermaid code in a pre with class 'mermaid'. Will be processed later.
                    // Escape the mermaid code itself to prevent issues before Mermaid processes it.
                    return `<pre class="mermaid">${Editor.EscapeHtml(str)}</pre>`;
                }
                if (lang && typeof hljs !== 'undefined' && hljs.getLanguage(lang)) {
                    try {
                        const highlightedCode = hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
                        // Wrap in pre>code tags for semantic correctness and styling
                        return `<pre class="hljs language-${lang}"><code>${highlightedCode}</code></pre>`;
                    } catch (__) {
                        console.warn("Highlight.js error for lang:", lang, __);
                    }
                }
                // Default: escape HTML and wrap in pre>code
                return `<pre class="hljs"><code>${Editor.markdownItInstance.utils.escapeHtml(str)}</code></pre>`;
            }
        });

        // Check if footnote plugin exists before using
        if (typeof markdownitFootnote === 'function') {
            this.markdownItInstance = this.markdownItInstance.use(markdownitFootnote);
        } else {
            console.warn("markdown-it-footnote plugin not available");
        }

        // Setup marked.js 
        if (typeof marked !== 'function' && typeof marked !== 'object') {
            console.warn("marked library not loaded.");
        } else {
            this.state.libsReady.marked = true;
            console.log("Marked library detected", marked);

            // Configure marked with specialized settings for math processing
            marked.setOptions({
                renderer: new marked.Renderer(),
                highlight: function (code, lang) {
                    if (lang && lang === 'mermaid') {
                        return `<pre class="mermaid">${Editor.EscapeHtml(code)}</pre>`;
                    }
                    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                    return hljs.highlight(code, { language }).value;
                },
                pedantic: false,
                gfm: true,
                breaks: false,
                sanitize: false, // IMPORTANT: Don't sanitize for math
                smartLists: true,
                smartypants: false,
                xhtml: false
            });

            this.markedInstance = marked;
        }

        // 3. Initialize Mermaid
        this.InitializeMermaid();

        // 4. Setup Debounced Update
        this.debouncedUpdate = debounce(this.UpdatePreview.bind(this), this.config.debounceDelay);

        // 5. Add Event Listeners
        this.elements.textarea.addEventListener('input', this.debouncedUpdate);

        // Markdown engine switcher
        this.elements.markdownItBtn.addEventListener('click', () => this.SetMarkdownEngine('markdown-it'));
        this.elements.markedBtn.addEventListener('click', () => this.SetMarkdownEngine('marked'));

        // Math engine switcher
        this.elements.mathJaxBtn.addEventListener('click', () => this.SetMathEngine('mathjax'));
        this.elements.kaTeXBtn.addEventListener('click', () => this.SetMathEngine('katex'));

        // Download buttons
        this.elements.downloadPdfBtn.addEventListener('click', () => this.DownloadAs('pdf'));
        this.elements.downloadMdBtn.addEventListener('click', () => this.DownloadAs('md'));
        this.elements.downloadTxtBtn.addEventListener('click', () => this.DownloadAs('txt'));

        // Custom CSS
        this.elements.toggleCssBtn.addEventListener('click', this.ToggleCustomCSS.bind(this));
        this.elements.applyCssBtn.addEventListener('click', this.ApplyCustomCSS.bind(this));
        this.elements.closeCssBtn.addEventListener('click', this.ToggleCustomCSS.bind(this)); // Close uses toggle

        // Mobile view detection and handling
        this.CheckMobileView();
        window.addEventListener('resize', this.CheckMobileView.bind(this));

        // Mobile view toggle buttons
        if (this.elements.showEditorBtn && this.elements.showPreviewBtn) {
            this.elements.showEditorBtn.addEventListener('click', () => this.SetMobilePane('editor'));
            this.elements.showPreviewBtn.addEventListener('click', () => this.SetMobilePane('preview'));
        }

        // Connect mobile menu buttons to their desktop counterparts
        this.ConnectMobileMenuButtons();

        // 6. Check library readiness
        this.state.lastText = this.elements.textarea.value;
        this.CheckLibraries();
    },

    CheckLibraries: function () {
        // Check MathJax
        if (typeof MathJax !== 'undefined' && MathJax.Hub) {
            this.state.libsReady.mathJax = true;
        }

        // Check KaTeX
        if (typeof katex !== 'undefined' && typeof renderMathInElement === 'function') {
            this.state.libsReady.katex = true;
        }

        // Check Mermaid
        if (typeof mermaid !== 'undefined' && typeof mermaid.mermaidAPI !== 'undefined') {
            this.state.libsReady.mermaid = true;
        }

        // Check highlight.js
        if (typeof hljs !== 'undefined') {
            this.state.libsReady.hljs = true;
        }

        // Check Marked
        if (typeof marked === 'function') {
            this.state.libsReady.marked = true;
        }

        // If all libraries are ready or we've waited long enough, initialize the editor
        if (this.AllLibrariesReady() && !this.state.isInitialized) {
            this.state.isInitialized = true;
            this.UpdatePreview();
        } else if (!this.state.isInitialized) {
            setTimeout(() => this.CheckLibraries(), 300);
        }
    },

    AllLibrariesReady: function () {
        // Check if core libraries are ready (we can proceed without some)
        return (this.state.libsReady.markdownIt || this.state.libsReady.marked) &&
            (this.state.libsReady.mathJax || this.state.libsReady.katex);
    },

    InitializeMermaid: function () {
        if (typeof mermaid !== 'undefined') {
            try {
                // Simpler initialization with minimal settings
                mermaid.initialize({
                    startOnLoad: false,
                    theme: 'default',
                    securityLevel: 'loose',
                    fontFamily: 'sans-serif',
                    logLevel: 'fatal', // Only the most critical errors
                });
                this.state.libsReady.mermaid = true;
            } catch (e) {
                console.error("Failed to initialize Mermaid:", e);
            }
        } else {
            console.warn("Mermaid library not available");
        }
    },

    UpdatePreview: function () {
        const text = this.elements.textarea.value;

        try {
            // --- Scroll Synchronization ---
            const scrollPercent = this.elements.previewPane.scrollTop / (this.elements.previewPane.scrollHeight - this.elements.previewPane.clientHeight);

            // Render Markdown based on selected engine
            if (this.state.currentMarkdownEngine === 'markdown-it' && this.state.libsReady.markdownIt) {
                // --- Use existing markdown-it rendering logic ---
                this.state.lastRenderedHTML = this.markdownItInstance.render(text);

                // Update Preview Pane Content
                this.elements.previewContent.innerHTML = this.state.lastRenderedHTML;

                // Process enhancements
                this.ProcessMath();
                this.ProcessMermaid();
            }
            else if (this.state.currentMarkdownEngine === 'marked' && this.state.libsReady.marked) {
                // --- Use the custom marked rendering logic with MathJax preprocessing ---
                this.RenderWithMarked(text, scrollPercent);
                return; // Early return as scroll restoration is handled in RenderWithMarked
            }
            else {
                console.error("No valid markdown engine available");
                this.elements.previewContent.innerHTML = '<p>Error: No valid markdown renderer available</p>';
                return;
            }

            // Restore scroll position for markdown-it rendering
            requestAnimationFrame(() => {
                const newScrollHeight = this.elements.previewPane.scrollHeight;
                const newScrollTop = scrollPercent * (newScrollHeight - this.elements.previewPane.clientHeight);
                if (isFinite(scrollPercent) && newScrollHeight > this.elements.previewPane.clientHeight) {
                    this.elements.previewPane.scrollTop = newScrollTop;
                } else {
                    this.elements.previewPane.scrollTop = 0;
                }
            });

            // Update state
            this.state.lastText = text;

        } catch (err) {
            console.error("Error during Markdown rendering or post-processing:", err);
            this.elements.previewContent.innerHTML = `<p style='color: red; font-weight: bold;'>Error rendering preview. Check console for details.</p><pre>${this.EscapeHtml(err.stack || err.message)}</pre>`;
        }
    },

    // Reverting to the previous working implementation for marked + MathJax
    RenderWithMarked: function (text, scrollPercent) {
        // Make sure buffer element exists
        if (!this.elements.buffer) {
            console.error("MathJax buffer element is missing");
            this.elements.buffer = document.createElement('div');
            this.elements.buffer.id = "mathjax-buffer";
            this.elements.buffer.style.display = 'none';
            document.body.appendChild(this.elements.buffer);
        }

        // Special handling for MathJax with marked
        if (this.state.currentMathEngine === 'mathjax') {
            try {
                if (!this.state.mathJaxRunning) {
                    this.state.mathJaxRunning = true;

                    // Critical step: Escape HTML before MathJax processing
                    const escapedText = this.EscapeHtml(text);
                    this.elements.buffer.innerHTML = escapedText;

                    // Process with MathJax first
                    MathJax.Hub.Queue(
                        ["resetEquationNumbers", MathJax.InputJax.TeX],
                        ["Typeset", MathJax.Hub, this.elements.buffer],
                        () => {
                            try {
                                // After MathJax processing, get the content from buffer
                                const mathJaxProcessedHtml = this.elements.buffer.innerHTML;

                                // Now parse with Marked
                                const finalHtml = marked.parse(mathJaxProcessedHtml);

                                // Update the preview with the final content
                                this.elements.previewContent.innerHTML = finalHtml;

                                // Process Mermaid diagrams if any
                                this.ProcessMermaid();

                                // Restore scroll position
                                this._restoreScrollPosition(scrollPercent);

                                // Update state
                                this.state.lastText = text;
                                console.log("MathJax + Marked rendering complete");
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
        }
        // Handle KaTeX or fallback rendering
        else {
            try {
                // Regular path for KaTeX or non-math rendering
                const html = marked.parse(text);
                this.elements.previewContent.innerHTML = html;

                // Process KaTeX if selected
                if (this.state.currentMathEngine === 'katex') {
                    this.ProcessMath();
                }

                // Process Mermaid diagrams
                this.ProcessMermaid();

                // Restore scroll position
                this._restoreScrollPosition(scrollPercent);

                // Update state
                this.state.lastText = text;
            } catch (err) {
                console.error("Error during standard marked rendering:", err);
                this.elements.previewContent.innerHTML = `<p style='color: red;'>Error rendering preview with marked.</p>`;
            }
        }
    },

    // Private helper method for scroll restoration
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
                        throwOnError: false // Prevent errors from halting script
                    });
                } else {
                    console.warn("KaTeX auto-render not available or not ready.");
                }
            } else if (this.state.currentMathEngine === 'mathjax' && this.state.libsReady.mathJax) {
                if (typeof MathJax !== 'undefined' && MathJax.Hub) {
                    if (this.config.mathJaxProcessing) {
                        return;
                    }
                    this.config.mathJaxProcessing = true;
                    MathJax.Hub.Queue(
                        ["Typeset", MathJax.Hub, this.elements.previewContent],
                        () => { this.config.mathJaxProcessing = false; console.log("MathJax Typeset complete."); }
                    );
                } else {
                    console.warn("MathJax not available or not ready.");
                }
            }
        } catch (err) {
            console.error(`Error processing math with ${this.state.currentMathEngine}:`, err);
            const errorDiv = document.createElement('div');
            errorDiv.style.color = 'orange';
            errorDiv.textContent = `Math processing error (${this.state.currentMathEngine}). Check console.`;
            this.elements.previewContent.prepend(errorDiv); // Add to top
        }
    },

    ProcessMermaid: function () {
        if (typeof mermaid === 'undefined' || !this.elements.previewContent) {
            return;
        }

        const mermaidBlocks = this.elements.previewContent.querySelectorAll('pre.mermaid');
        if (mermaidBlocks.length === 0) {
            return;
        }

        // Simplify by just directly rendering all Mermaid blocks
        try {
            // Cleaner approach - let Mermaid handle it directly with a CSS selector
            mermaid.init(undefined, mermaidBlocks);
        } catch (err) {
            console.error("Error initializing mermaid diagrams:", err);

            // If batch rendering fails, try one-by-one with error handling
            mermaidBlocks.forEach((block, index) => {
                try {
                    // Create a cleaner div for the diagram
                    const container = document.createElement('div');
                    container.className = 'mermaid-diagram';

                    // Remove any trailing whitespace which can cause parsing issues
                    const code = this.UnescapeHtml(block.textContent || "").trim();
                    container.textContent = code;

                    // Replace the original block
                    if (block.parentNode) {
                        block.parentNode.replaceChild(container, block);

                        // Try to render this specific diagram
                        mermaid.init(undefined, container);
                    }
                } catch (blockErr) {
                    console.error(`Error rendering mermaid block ${index}:`, blockErr);

                    // Create error display
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

                    // Show the error instead
                    if (block.parentNode) {
                        block.parentNode.replaceChild(errorDiv, block);
                    }
                }
            });
        }
    },

    // Add mobile view detection
    CheckMobileView: function() {
        const wasMobile = this.state.isMobileView;
        this.state.isMobileView = window.innerWidth <= 768;
        
        // If mobile state changed, update UI
        if (wasMobile !== this.state.isMobileView) {
            if (this.state.isMobileView) {
                this.SetMobilePane(this.state.currentMobilePane);
            } else {
                // Restore desktop view
                if (this.elements.textarea && this.elements.textarea.parentElement) {
                    this.elements.textarea.parentElement.style.display = 'flex';
                }
                if (this.elements.previewPane) {
                    this.elements.previewPane.style.display = 'flex';
                }
            }
        }
    },

    // Toggle between editor and preview on mobile
    SetMobilePane: function(pane) {
        if (!this.state.isMobileView) return;
        
        this.state.currentMobilePane = pane;
        
        // Update button states
        if (this.elements.showEditorBtn && this.elements.showPreviewBtn) {
            this.elements.showEditorBtn.classList.toggle('active', pane === 'editor');
            this.elements.showPreviewBtn.classList.toggle('active', pane === 'preview');
        }
        
        // Show/hide panes
        if (this.elements.textarea && this.elements.textarea.parentElement) {
            this.elements.textarea.parentElement.style.display = pane === 'editor' ? 'flex' : 'none';
        }
        
        if (this.elements.previewPane) {
            this.elements.previewPane.style.display = pane === 'preview' ? 'flex' : 'none';
        }
        
        // If switching to preview, ensure it's updated
        if (pane === 'preview') {
            this.UpdatePreview();
        }
    },

    SetMarkdownEngine: function (engine) {
        if (engine !== this.state.currentMarkdownEngine) {
            this.state.currentMarkdownEngine = engine;

            // Update button styles
            this.elements.markdownItBtn.classList.toggle('active', engine === 'markdown-it');
            this.elements.markedBtn.classList.toggle('active', engine === 'marked');

            // Trigger a re-render with the new engine
            this.UpdatePreview();
        }
    },

    SetMathEngine: function (engine) {
        if (engine !== this.state.currentMathEngine) {
            this.state.currentMathEngine = engine;

            // Update button styles
            this.elements.mathJaxBtn.classList.toggle('active', engine === 'mathjax');
            this.elements.kaTeXBtn.classList.toggle('active', engine === 'katex');

            // Trigger a re-render with the new engine
            this.UpdatePreview();
        }
    },

    ToggleCustomCSS: function () {
        this.state.customCssVisible = !this.state.customCssVisible;
        this.elements.customCssContainer.style.display = this.state.customCssVisible ? 'flex' : 'none';
        this.elements.toggleCssBtn.textContent = this.state.customCssVisible ? 'Hide CSS' : 'Custom CSS';
        if (this.state.customCssVisible) {
            this.elements.customCssInput.focus();
        }
    },

    ApplyCustomCSS: function () {
        const css = this.elements.customCssInput.value;
        // Basic validation/sanitization might be needed here in a real app
        this.elements.customStyleTag.innerHTML = css;
        console.log("Applied Custom CSS");
        // Optionally close after applying:
        // if (this.state.customCssVisible) {
        //     this.ToggleCustomCSS();
        // }
    },

    DownloadAs: function (format) {
        const text = this.state.lastText; // Use the text from the last successful update
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
        // Delay removal slightly for Firefox
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log(`Download triggered for ${filename}`);
        }, 100);
    },

    _generatePdf: async function (filename) {
        // Check if PDF libraries are available
        if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined') {
            alert('PDF generation libraries not loaded yet. Please try again in a moment.');
            console.error('PDF libraries not available');
            return;
        }

        const previewContent = this.elements.previewContent;
        if (!previewContent) return;

        // Update UI to show we're working
        console.log("Starting PDF generation...");
        this.elements.downloadPdfBtn.textContent = 'Generating...';
        this.elements.downloadPdfBtn.disabled = true;

        try {
            // 1. Create a new div to hold our content that we'll print
            const printContainer = document.createElement('div');
            printContainer.className = 'pdf-container';
            printContainer.innerHTML = previewContent.innerHTML;
            printContainer.style.width = '650px'; // Fixed width for consistent rendering
            printContainer.style.backgroundColor = 'white';
            printContainer.style.color = 'black';
            printContainer.style.padding = '40px';
            printContainer.style.fontSize = '12pt';
            printContainer.style.lineHeight = '1.4';
            printContainer.style.position = 'absolute';
            printContainer.style.top = '0';
            printContainer.style.left = '-9999px';
            document.body.appendChild(printContainer);

            // 2. Wait for any MathJax content to render in the container
            if (this.state.currentMathEngine === 'mathjax' && typeof MathJax !== 'undefined') {
                await new Promise((resolve) => {
                    MathJax.Hub.Queue(["Typeset", MathJax.Hub, printContainer], resolve);
                });
                // Give some extra time for rendering
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // 3. Improve content for PDF rendering
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

            // 4. Generate PDF using html2canvas + jsPDF
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

            // 5. Capture the content with html2canvas
            const canvas = await html2canvas(printContainer, pdfOptions);
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const imgWidth = contentWidth;
            const ratio = canvas.height / canvas.width;
            const imgHeight = contentWidth * ratio;

            // NEW multipage logic:
            const pageInnerHeight = pageHeight - (margin * 2);
            let heightLeft = imgHeight;
            let position = margin;
            let pageCount = 1;

            // first page
            pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
            heightLeft -= pageInnerHeight;

            // subsequent pages
            while (heightLeft > 0) {
                pageCount++;
                position = heightLeft - imgHeight + margin;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', margin, position, imgWidth, imgHeight);
                heightLeft -= pageInnerHeight;
            }

            // 8. Save the PDF
            pdf.save(filename);
            console.log(`PDF saved with ${pageCount} pages`);

            // 9. Clean up
            document.body.removeChild(printContainer);

        } catch (error) {
            console.error("Error generating PDF:", error);
            alert(`Error generating PDF: ${error.message || 'Unknown error'}`);
        } finally {
            // 10. Reset the UI
            this.elements.downloadPdfBtn.textContent = 'Save as PDF';
            this.elements.downloadPdfBtn.disabled = false;
        }
    },


    // Basic HTML entity escaping (useful for pre-Mermaid storage)
    EscapeHtml: function (str) {
        if (!str) return "";
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    // Basic HTML entity unescaping (needed for Mermaid rendering)
    UnescapeHtml: function (str) {
        if (!str) return "";
        // DOMParser is safer than manual replacement
        try {
            const doc = new DOMParser().parseFromString(str, 'text/html');
            return doc.documentElement.textContent || "";
        } catch (e) {
            console.error("Error unescaping HTML:", e);
            return str; // Return original string on error
        }
    },

    // Add this method to the Editor object to handle mobile menu buttons
    ConnectMobileMenuButtons: function() {
        // Markdown engine buttons
        const markdownItMobile = document.getElementById('btn-markdown-it-mobile');
        const markedMobile = document.getElementById('btn-marked-mobile');
        const mathjaxMobile = document.getElementById('btn-mathjax-mobile');
        const katexMobile = document.getElementById('btn-katex-mobile');
        const downloadPdfMobile = document.getElementById('btn-download-pdf-mobile');
        const downloadMdMobile = document.getElementById('btn-download-md-mobile');
        const downloadTxtMobile = document.getElementById('btn-download-txt-mobile');
        const toggleCssMobile = document.getElementById('btn-toggle-css-mobile');
        const mobileMenu = document.getElementById('mobile-menu');
        const hamburgerBtn = document.getElementById('mobile-hamburger');

        // Helper function to close mobile menu
        const closeMenu = () => {
            if (mobileMenu && hamburgerBtn) {
                mobileMenu.classList.remove('open');
                hamburgerBtn.classList.remove('active');
            }
        };

        // Markdown engine buttons
        if (markdownItMobile && markedMobile) {
            markdownItMobile.addEventListener('click', () => {
                this.SetMarkdownEngine('markdown-it');
                markdownItMobile.classList.add('active');
                markedMobile.classList.remove('active');
                closeMenu();
            });
            
            markedMobile.addEventListener('click', () => {
                this.SetMarkdownEngine('marked');
                markedMobile.classList.add('active');
                markdownItMobile.classList.remove('active');
                closeMenu();
            });
        }
        
        // Math engine buttons
        if (mathjaxMobile && katexMobile) {
            mathjaxMobile.addEventListener('click', () => {
                this.SetMathEngine('mathjax');
                mathjaxMobile.classList.add('active');
                katexMobile.classList.remove('active');
                closeMenu();
            });
            
            katexMobile.addEventListener('click', () => {
                this.SetMathEngine('katex');
                katexMobile.classList.add('active');
                mathjaxMobile.classList.remove('active');
                closeMenu();
            });
        }
        
        // Download buttons
        if (downloadPdfMobile) {
            downloadPdfMobile.addEventListener('click', () => {
                this.DownloadAs('pdf');
                closeMenu();
            });
        }
        
        if (downloadMdMobile) {
            downloadMdMobile.addEventListener('click', () => {
                this.DownloadAs('md');
                closeMenu();
            });
        }
        
        if (downloadTxtMobile) {
            downloadTxtMobile.addEventListener('click', () => {
                this.DownloadAs('txt');
                closeMenu();
            });
        }
        
        // Custom CSS button
        if (toggleCssMobile) {
            toggleCssMobile.addEventListener('click', () => {
                this.ToggleCustomCSS();
                closeMenu();
            });
        }
    },
};

// Initialize the editor when the DOM is fully loaded and parsed
document.addEventListener('DOMContentLoaded', () => {
    Editor.Init();
});

// Fallback initialization in case DOMContentLoaded already fired
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
        if (!Editor.state.isInitialized) {
            Editor.Init();
        }
    }, 1);
};