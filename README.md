# Markdown Editor With Better Complex Math Equation Support .

This is a little Markdown editor [Try here](https://nav9v.github.io/online-markdown-editor). It's designed to handle a bunch of cool stuff, making it easy to write and preview your documents.

![Preview](https://github.com/user-attachments/assets/beaf8c9e-7cd7-4a57-b9f1-78770c772f96)


## Unlike other Markdown preview apps, this one can render almost all LLM-generated output including math formulas, equations, and tables - directly in Markdown.

## What Can It Do? ✨

Quick rundown of the features:

*   **Live Markdown Preview:** As you type Markdown on the left, you'll see it rendered as HTML on the right, almost instantly!
*   **Switchable Markdown Engines:** You can choose between two popular Markdown parsers:
    *   `markdown-it`: Generally great for features like footnotes and follows CommonMark closely.
    *   `marked`: Another fast and reliable option.
*   **Awesome Math Support:** Write your math equations using LaTeX syntax!
    *   Supports inline math like `$E=mc^2$` and display math like `$$ ... $$` or `\[ ... \]`.
    *   You can switch between **MathJax** and **KaTeX** to see which renders your math best.
*   **Code Syntax Highlighting:** Paste your code blocks (like Python, JavaScript, CSS, etc.), and they'll get nicely colored using `highlight.js`. Just make sure to specify the language after the first three backticks (e.g., ```python).
*   **Mermaid Diagrams:** Create flowcharts, sequence diagrams, and more directly in your Markdown using Mermaid syntax (just use a ```mermaid code block).
*   **Footnotes:** Easily add footnotes[^1] using the standard Markdown syntax (requires `markdown-it` engine).
*   **Download Your Work:**
    *   **Save as PDF:** Get a PDF version of your rendered preview.
    *   **Save as MD:** Download the raw Markdown text you typed.
    *   **Save as TXT:** Get a plain text file.
*   **Custom Preview Styles:** Want the preview to look a bit different? Hit the "Custom CSS" button and add your own CSS rules to tweak the appearance.


## How to Run It Locally 🚀

Getting this running on your own machine is super simple because it's just HTML, CSS, and JavaScript.

1.  **Download the Files:** Make sure you have all the files (`index.html`, `style.css`, `script.js`, and this `README.md`) in a folder on your computer.
2.  **Open the HTML File:** Just double-click the `index.html` file. Your web browser (like Chrome, Firefox, Edge, etc.) will open it right up.
3.  **That's It!** You should see the editor ready to go.

**Important Note:** This editor relies on several external libraries (like `markdown-it`, `MathJax`, `KaTeX`, `highlight.js`, `Mermaid`, etc.) that are loaded from the internet (CDNs). **This means you'll need an active internet connection for all the features to work correctly when you run `index.html` locally.**

### Inspiration came from [here](https://github.com/kerzol/markdown-mathjax)

Enjoy writing!
