---
name: Radar Metrology — Mahabaleshwar
description: A light studio exhibition and a restrained scientific research workspace.
colors:
  ink: "#243f3e"
  body-ink: "#263e3d"
  muted: "#677772"
  accent: "#236269"
  action: "#214e4e"
  line: "#dce2dc"
  paper: "#f5f6f3"
  studio: "#f4f5f1"
  sage-field: "#e7ede5"
  workspace: "#f6f8f5"
  sidebar: "#f0f3ed"
  panel: "#fbfcf9"
  white: "#ffffff"
  nav-selected: "#e0e9dd"
  nav-selected-ink: "#2d584a"
  focus: "#257e87"
  field-focus: "#7eb5b2"
  echo-teal: "#427b77"
  atmosphere-floor: "#dfe6df"
  pulse-surface: "#edf4ee"
  data-01: "#d7eced"
  data-02: "#80c9de"
  data-03: "#429fc1"
  data-04: "#2778ae"
  data-05: "#58ab8c"
  data-06: "#8dc96b"
  data-07: "#d4d965"
  data-08: "#f1cb54"
  data-09: "#efa348"
  data-10: "#dc7044"
  data-11: "#bd4246"
  data-12: "#8d4168"
typography:
  display:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(62px, 6.9vw, 104px)"
    fontWeight: 400
    lineHeight: 1.03
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Manrope, sans-serif"
    fontSize: "clamp(32px, 3.2vw, 46px)"
    fontWeight: 400
    lineHeight: 1.22
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Manrope, sans-serif"
    fontSize: "27px"
    fontWeight: 500
    letterSpacing: "-0.035em"
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
  workspace-body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  supporting:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "11px"
    fontWeight: 400
rounded:
  badge: "3px"
  field: "4px"
  button: "5px"
  panel: "6px"
  preview: "7px"
spacing:
  compact: "8px"
  control: "12px"
  field-gap: "15px"
  workspace-gap: "18px"
  panel-gap: "20px"
  mobile-edge: "22px"
  roomy-panel: "30px"
  workspace-edge: "35px"
  landing-edge: "56px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.white}"
    rounded: "{rounded.button}"
    padding: "12px 21px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "12px 21px"
  workspace-button:
    backgroundColor: "{colors.action}"
    textColor: "{colors.white}"
    rounded: "{rounded.button}"
    padding: "9px 13px"
  numeric-field:
    backgroundColor: "{colors.white}"
    textColor: "#46613f"
    rounded: "{rounded.field}"
    padding: "9px 10px"
  control-panel:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    padding: "20px 17px"
  navigation-selected:
    backgroundColor: "{colors.nav-selected}"
    textColor: "{colors.nav-selected-ink}"
    rounded: "{rounded.button}"
    padding: "10px 12px"
  signal-button:
    backgroundColor: "{colors.pulse-surface}"
    rounded: "{rounded.button}"
    padding: "10px 13px"
---

# Design System: Radar Metrology — Mahabaleshwar

## Overview

**Creative North Star: "Beam to Data"**

A representative radar occupies a pale studio, with soft physical shadows, subdued metal and green-grey materials. Expressive large type and muted teal actions frame the instrument while an illustrative sampling field unfolds around it. The exhibition is spacious and spatial; the research workspace uses the same family of surfaces at a more compact, formal density.

The implemented system is a local research prototype. Representative models, illustrative echoes and synthetic datasets retain explicit labels. The analytical view keeps methods, units and provenance close to the output. Its visual confidence comes from clear structure and usable scientific controls.

**Key Characteristics:**
- Light studio material and cool sage surfaces.
- Expressive Manrope exhibition headings with DM Sans controls and explanatory text.
- Dark teal actions and a distinct scientific data palette.
- Thin borders, gently curved panels and restrained shadows.
- Intact physical instrument, rising sampled-gate field and a rendered static alternative.

This is a scan of the implemented source in stylesheet order: `styles.css`, `legibility.css`, then `exhibition.css`. It records no final visual-review verdict. Page composition and direction contracts live in `.impeccable/surfaces/`.

## Colors

The interface combines green-tinted paper with dark teal ink; multicolour bands belong to measured or illustrative data.

### Primary
- **Instrument Teal** (`accent`): the shared accent family for instrument details and control emphasis.
- **Deep Teal Action** (`action`): filled calls to action with white text.
- **Focus Teal** (`focus`, `field-focus`): visible keyboard focus for actions and fields respectively.
- **Echo Teal** (`echo-teal`): expressive headline emphasis, related to the sampling field's green-blue materials.
- **Pulse Surface** (`pulse-surface`): the Send a pulse control in the spatial exhibition.

### Secondary
- **Scientific Scale** (`data-01` through `data-12`): the ordered pale cyan, blue, green, yellow, orange, red and plum palette from `src/data.ts`. Preserve order and show bounds and units with the plot. The landing preview uses a shortened illustrative gradient; the workspace uses the full palette.

### Neutral
- **Deep Green Ink** (`ink`, `body-ink`): headings, shared interface text and body defaults.
- **Muted Green Grey** (`muted`): a shared supporting-text primitive; local surfaces use several related ink shades rather than one universal muted colour.
- **Studio Paper** (`paper`, `studio`): default background and landing field.
- **Sage Field** (`sage-field`): the broad supporting workflow region.
- **Research Paper** (`workspace`, `sidebar`, `panel`, `white`): workspace ground, persistent navigation, control containers and plot/form surfaces.
- **Fine Sage Line** (`line`): shared dividers; panel strokes use related surface-specific shades.
- **Atmosphere Floor** (`atmosphere-floor`): low-contrast decorative floor lettering behind the instrument and sampled field.
- **Selected Sage** (`nav-selected`, `nav-selected-ink`): persistent navigation selection.

**The Data Colour Rule.** Preserve the ordered scientific palette for plotted values and their legends; interface actions remain in the teal and sage family.

## Typography

**Display Font:** Manrope, with sans-serif fallback.
**Body Font:** DM Sans, with sans-serif fallback.
**Label/Mono Font:** DM Sans; there is no separate mono face. Analytical summary values use tabular numerals.

The pairing is geometric, with a large expressive exhibition headline and quieter application typography. Display weight stays light enough for the radar and field to remain visible; application titles and labels gain weight to support scanning. Both fonts are loaded through the Google Fonts stylesheet in `index.html`.

### Hierarchy
- **Display:** the frontmatter display role belongs to the hero. The transition title uses a separate fluid range (`clamp(48px, 5.1vw, 76px)`) with 1.08 leading. Hero type steps to 76px at 1100px, 66px at 900px and 63px at 700px; phone leading is 1.02. The low-contrast floor word is a decorative spatial layer, sized at 15.4vw rather than a content heading.
- **Headline:** supporting landing sections use the headline role; shorter detail headings use the same face at smaller sizes.
- **Title:** application page titles use the title role, reducing to 24px on phones.
- **Body:** landing explanation uses the body role; the hero increases leading to 1.8. Workspace text is more compact, with 12px explanations and 13px data titles in current overrides.
- **Label:** scientific controls and selected navigation use the label role. Supporting units, legends and metadata use the supporting role; specific phone metadata reduces to 10px.

**The Scientific Legibility Rule.** Read the effective cascade through `src/legibility.css` and `src/exhibition.css` before reusing a size from the base stylesheet; the base stylesheet contains superseded small text values.

## Layout

The landing uses a centred container capped at 1280px, with 56px outer edges at desktop widths. The shared container reduces to 36px edges at 1150px and 22px at 700px. Its sections pair generous open space with a large instrument or scientific plot. The surface brief owns the exact exhibition sequence.

The desktop workspace has a fixed 232px sidebar, a 72px top bar and a main area capped at 1800px with 35px horizontal padding. The analysis grid pairs a 209px control column with a fluid plot and an 18px gap. At 1600px and above the control column grows to 230px. At 1150px the sidebar becomes 203px, controls 183px and main padding 25px. At 900px the sidebar becomes a 73px rail and main padding becomes 22px.

At 700px the sidebar becomes a sticky horizontal header, the top bar is 48px, main padding is 16px horizontally and the analysis grid stacks. Controls become a two-column grid. The instrument section stacks and workflow steps become rows. The two primary navigation entries remain text-and-icon controls, each with a 140px minimum width. The current summary is four columns on wide screens and two columns at 1150px and below. Plot heights vary by context: 410px normally, 470px on large desktop, 385px at the intermediate breakpoint and 360px on phones.

Spacing is contextual rather than a rigid uniform scale: field gaps are compact, panels typically use 18–30px padding, and the exhibition uses 65–96px section padding. Preserve the difference between the spacious exhibition and the denser analytical workspace.

## Elevation & Depth

Most application structure comes from pale surface changes and fine strokes. Physical depth is concentrated in the radar model, which has a shadow-catching floor and softly lit metallic materials. A translucent beam sheet and a rising volumetric sampling field extend that depth while the instrument stays intact. Application depth is limited to selected tabs, the export menu and timeline selection.

### Shadow Vocabulary
- **Export menu:** `0 10px 25px #1f3c3010`, for a transient menu above a panel.
- **Selected view tab:** `0 1px 3px #1f3c3014`, to distinguish the white selected tab.
- **Current timeline point:** `0 0 0 3px #dfebd5`, a state halo rather than a container shadow.

**The Measured Depth Rule.** Keep analysis panels flat and bordered; reserve cast shadows for spatial exhibition content and genuinely overlaid or selected controls.

## Shapes

Small rectangular forms have gently curved corners. Badges use the badge radius; inputs and small controls use the field radius; buttons and navigation use the button radius; analytical panels use the panel radius. Landing plot containers use the slightly larger preview radius. Circular forms belong to radar geometry, range rings, small status points, the guest avatar and upload symbol. The exhibition's repeated sampled gates are slim spatial cuboids, not interface cards.

One-pixel borders define controls and panel boundaries. Plot and preview containers clip their content. Inline Lucide SVGs provide consistent line icons; scientific rings and crosshairs are drawn by the plot itself.

## Components

### Buttons

Compact, direct actions with text and an optional line icon. Primary and outline variants share the frontmatter shape and padding. Base buttons have a 47px minimum height, 13px text and an 18px icon gap; small landing buttons reduce to 40px. Workspace buttons use 37px minimum height, 11px text and a 9px gap, reducing to 34px on phones. Outline strokes use a fine sage line.

Imported motion applies a one-pixel pointer hover lift and a pressed translation with a small scale change. Shared timing is 140ms entering, 200ms leaving and 90ms pressing, with the soft ease-out curve recorded in the sidecar. Action focus uses a two-pixel outline with a five-pixel offset. Disabled buttons use 45% opacity and a disabled cursor.

### Chips

Small squared status badges carry provenance or prototype state. Synthetic badges use a pale sage fill, fine stroke and readable dark green text; uploaded-file badges use a more blue-green tint. They are informational, not decorative filters. Their desktop text is 11px after the legibility overrides.

### Cards / Containers

Control, plot and dataset panels use light fills, fine sage borders and the panel radius. Control panels follow the frontmatter padding. The plot panel clips its toolbar, drawing, colourbar, optional rainfall-method row and timeline into one coherent scientific instrument. Avoid adding a shadow to every container.

### Inputs / Fields

Native selects, numeric inputs, ranges and checks retain their clear control affordances. Numeric fields use white fills, a fine green-grey border, a minimum height of 36px and a label with an adjacent unit where needed. Workspace control text is 12px in the effective cascade. Field focus uses a two-pixel outline with a two-pixel offset. Phone control fields are 32px high while retaining 12px text.

### Navigation

Landing navigation uses plain text links with a fine underline on hover and an outline workspace action. Phones use an explicit menu toggle and a vertically arranged disclosure beneath the header. Workspace navigation uses left-aligned SVG icons and text on sage; selection gains a pale sage fill and medium-weight ink. The tablet rail and phone header are responsive expressions of the same navigation. The guest initial is a prototype identity marker, not an account control.

### Radar exhibition

Desktop uses React Three Fiber with demand rendering. Pointer movement gently steers the antenna through interpolation; dragging rotates the view. Scrolling reframes the camera and raises the floor's sampled gates into a volumetric echo field, leaving the radar intact. A user-triggered pulse expands and fades over 1800ms. The low-contrast ATMOSPHERE floor word and the Transmit / Sample / Explore progress line belong to the exhibition. The PPI preview appears in the separate supporting section. At widths of 700px or less, or with reduced motion requested, the landing renders `/radar-poster.png` instead of mounting the 3D scene. Keep interaction instructions appropriate to the active version.

### Scientific plot

PPI and schematic regional views share the canvas, ordered data palette and explicit legends. Readouts show value, units, azimuth and range. Schematic context keeps its qualifier visible, with pan and zoom controls. Labels distinguish illustrative and source-file scans. Range rings, cardinal directions and tabular summary values are functional marks. Rainfall is a product of the selected scan, with a fixed baseline method row and an assumptions link; it is not a standalone calculator surface. Demo playback advances on an explicit user action; this documentation does not imply autonomous decorative animation.

## Do's and Don'ts

### Do:
- **Do** preserve the light studio and the formal scientific workspace as expressions of one visual family.
- **Do** keep scientific units, provenance and synthetic or representative labels visible beside the relevant material.
- **Do** use the effective legibility overrides when extending controls, legends and metadata.
- **Do** keep the rendered static poster for mobile and reduced-motion visitors.
- **Do** keep keyboard focus visible and use SVG line icons for interface controls.

### Don't:
- **Don't** replace the pinned studio direction with an alternate visual world.
- **Don't** use the scientific data scale as decorative interface colour.
- **Don't** imply surveyed geography, a verified station model or measured data through unqualified visuals.
- **Don't** turn the landing's exhibition composition into a required layout for analytical screens.
- **Don't** inherit incidental small uppercase location, workspace or step labels as a general eyebrow pattern.

Not canonized: incidental uppercase micro-labels, superseded tiny base-CSS typography, removed-surface CSS and unused generic motion-library hooks. They are implementation residue rather than reusable design rules. The expressive floor word is native to the pinned spatial exhibition. This documentation does not repair source or assert a completed visual review.
