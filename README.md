# Geometry Dash Level Maker

A browser app that generates a `.gmd` file from:

- level name
- difficulty
- level length preset
- uploaded music file (used for rough sync analysis)

## Run locally

Use the included server (prevents "Not Found" on refresh/deep links):

```bash
npm start
```

Then open: `http://localhost:8000`

## Notes

- The generator uses Web Audio API RMS analysis to place level objects near louder segments.
- The exported `.gmd` file is XML-based and intended for GDShare-based import workflows.
