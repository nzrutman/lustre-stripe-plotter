# lustre-stripe-plotter

Graphically display the layout of a Lustre file.

Generate your file's layout YAML using `lfs getstripe -y <filename> > <filename.yaml>`.

Run this code to:

- produce a cleaner, consistent, mirror-based YAML
- generate a jpg of the layout

You can now also run this directly in the browser with a static web UI.

Usage:

`python striper.py <filename.yaml>`

Web usage:

- Open `index.html` in a browser (or host this repo as a static site).
- Upload or paste YAML from `lfs getstripe -y`.
- Click `Render Layout`.
- Download the result as SVG or PNG.

Some notes:

- OST labels are 4-digit hex.
- Component ID labels are `#<id>`
- `lcme_id` labels are `id<id>`
- If objects are not yet allocated for a component, they are displayed in gray.
- The extents are plotted as far as the last well-defined component, not necessarily the full extent of the file. This is to avoid making the graphic unreadable for large files.
- We only label the OSTs when they are first introduced; thereafter any repeats are just identified by color. This allows a clearer identification of unique objects.
- Overstriped files are similarly colored, but are each explicitly labelled. (Eg. 001A, 001A would indicate two overstripes.)
- If the rendered stripes in a component would be too small to distinguish, it just displays the total number of stripes for the component.

Example of mirrored DoM PFL file:

![mirrored_pfl_orig](examples/mirpfldom.jpg)

## Install

It's just this python script, but you'll need some other python packages:

`pip install --upgrade numpy matplotlib seaborn yaml scipy`

## Browser App

The browser app is a static frontend:

- `index.html`
- `app.js`
- `app.css`

It runs entirely client-side using `js-yaml` from a CDN. No backend required.

### Smoke Test

Run the JavaScript smoke test against all YAML files in `examples/`:

`npm install && npm run smoke-test`

This validates YAML loading, normalization, component parsing, and extent computation.

### Local Preview

You can open `index.html` directly, but using a local server gives better compatibility.

Example:

`python3 -m http.server 8000`

Then browse to:

`http://localhost:8000`

### Cloudflare Pages Deployment

1. Push this repo to GitHub.
1. In Cloudflare Pages, create a new project from this repo.
1. Use these settings:

- Framework preset: `None`
- Build command: *(leave blank)*
- Build output directory: `/`

1. Deploy.

No server-side runtime is needed for the browser app.

## Known Issues

- The size of the first object after a DoM component shoud be drawn smaller by \<DoM size\>. I didn't bother to fix this.
- The image is drawn to scale. If the size of components relative to the size of the total image is too small, some of the components may drawn very close to each other, which makes it hard to read. I can imagine someone with better python skills than mine could come up with a magnifying-glass overlay...
