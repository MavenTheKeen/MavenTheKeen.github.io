# Portfolio

My personal site. Plain HTML, CSS and JavaScript, no build step.

## Run it locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy

It is a GitHub Pages user site. Push to `main` on `MavenTheKeen.github.io` and it is live at https://maventhekeen.github.io/ a minute or two later.

## Notes to self

- Every `<section>` with a `data-stop` attribute is a station. `script.js` draws the line and the train from those, so sections can be added or reordered. Keep the dots in the header list and the footer links in step.
- Colours, fonts and the type scale are variables at the top of `styles.css`. `--line` is the line the train rides.
- Train size and feel are set in `startRide` in `script.js`.
- `og-image.png` is a 1200 x 630 screenshot of the top of the page. Retake it when the hero changes.
- `resume.pdf` is public. Check what it shows before replacing it.
