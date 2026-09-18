Use this tool at: `https://mechengineermike.github.io/ImageToVector/`. 

# Image to Vector

A free, private, browser-based raster-to-SVG converter tuned for single color artwork, script lettering, clipart, and laser engraver assets. Images are processed locally.

## Browser version

- Batch PNG, JPG, and WebP input
- Live original/vector comparison
- Adjustable threshold and speckle removal
- Optional curve optimization and inversion
- Transparent, black-path SVG output
- Single-file ZIP download for batches
- Four-times internal tracing scale when image size permits

The vector engine is [esm-potrace-wasm](https://github.com/tomayac/esm-potrace-wasm), distributed under GPL-2.0. Its license is included in `libs/POTRACE-LICENSE.txt`.

## Run locally

Browser modules require an HTTP server:

```powershell
python -m http.server 8080
```

Then open <http://localhost:8080>.

## Publish with GitHub Pages

1. Push the `main` branch to GitHub.
2. Open **Settings -> Pages** in the repository.
3. Choose **Deploy from a branch**.
4. Select `main` and `/ (root)`, then save.

## Desktop version

The original Python/Tkinter utility remains available as `PNG_to_SVG_v3.py`; use `SETUP.bat` once and launch it with `RUN_PNG_TO_SVG_v3.bat`.
