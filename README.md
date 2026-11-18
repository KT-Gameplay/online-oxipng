# Oxipng Studio (GitHub Pages)

A static PNG optimizer powered by Oxipng WebAssembly. PNG files are processed in the browser and are not uploaded to a server.

## Features

- Batch PNG optimization
- Oxipng compression levels 1–6
- Web Worker processing so the page remains responsive
- Exact decoded-pixel preservation: `optimiseAlpha` is disabled
- Keeps the original file when the optimized output is not smaller
- Per-file results and ZIP download
- GitHub Pages deployment through GitHub Actions

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy to GitHub Pages

1. Create a GitHub repository and upload the contents of this folder to its `main` branch.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, choose **GitHub Actions** as the source.
4. Push to `main`, or manually run **Deploy Oxipng Studio to GitHub Pages** from the Actions tab.
5. Open the Pages URL shown in the deployment job.

The workflow builds the static site. GitHub Actions is not used to process images; optimization happens locally in each visitor's browser.

## Notes

- The app uses `@jsquash/oxipng`, a browser-oriented WebAssembly wrapper around Oxipng.
- Compression levels 5 and 6 can take significantly longer.
- PNG metadata is not deliberately stripped by this UI. Oxipng's transformations may still change file structure and metadata representation.
- No multithreaded WASM is enabled, so cross-origin isolation headers are not required.
- The app requires a modern browser with WebAssembly and Web Workers support.

## License

The application code in this project is provided under the MIT License. The Oxipng project and jSquash package retain their own respective licenses; see their upstream repositories and package metadata.
