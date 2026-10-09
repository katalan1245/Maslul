/**
 * Draws the app's bitmap assets from the Kotlin app's vector drawables (the launcher icon, the
 * notification bus) and the map's own markers, as PNGs in assets/. Run: node scripts/make-assets.mjs
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = join(import.meta.dirname, '..', 'assets');
mkdirSync(join(out, 'map'), { recursive: true });
const png = (svg, width, file) => writeFileSync(join(out, file), new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng());

const BRAND = '#1F6FEB';
// app/src/main/res/drawable/ic_launcher_foreground.xml (108×108 adaptive-icon canvas).
const foreground = (fill) => `
  <path d="M38,72 C38,56 70,58 70,40" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" fill="none"/>
  <circle cx="38" cy="72" r="7" fill="#FFFFFF"/><circle cx="38" cy="72" r="3" fill="${fill}"/>
  <path d="M70,26c-6.1,0 -11,4.9 -11,11c0,8.2 11,19 11,19s11,-10.8 11,-19c0,-6.1 -4.9,-11 -11,-11z" fill="#FFFFFF"/>
  <circle cx="70" cy="37" r="4" fill="${fill}"/>`;
const canvas = (body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${bg ? `<rect width="108" height="108" fill="${bg}"/>` : ''}${body}</svg>`;

png(canvas(foreground(BRAND), BRAND), 1024, 'icon.png');
png(canvas(foreground(BRAND)), 1024, 'adaptive-icon.png');
// Monochrome (themed icons): one colour, the holes cut out.
png(canvas(foreground('#000000').replace(/fill="#000000"/g, 'fill="#000000" fill-opacity="0"')), 1024, 'adaptive-monochrome.png');
png(canvas(foreground(BRAND)), 512, 'splash-icon.png');

// app/src/main/res/drawable/ic_notification.xml: a white bus on a 24×24 canvas.
png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#FFFFFF" d="M4,16c0,0.88 0.39,1.67 1,2.22V20c0,0.55 0.45,1 1,1h1c0.55,0 1,-0.45 1,-1v-1h8v1c0,0.55 0.45,1 1,1h1c0.55,0 1,-0.45 1,-1v-1.78c0.61,-0.55 1,-1.34 1,-2.22V6c0,-3.5 -3.58,-4 -8,-4s-8,0.5 -8,4v10zM7.5,17c-0.83,0 -1.5,-0.67 -1.5,-1.5S6.67,14 7.5,14s1.5,0.67 1.5,1.5S8.33,17 7.5,17zM16.5,17c-0.83,0 -1.5,-0.67 -1.5,-1.5s0.67,-1.5 1.5,-1.5 1.5,0.67 1.5,1.5 -0.67,1.5 -1.5,1.5zM18,11H6V6h12v5z"/></svg>`, 96, 'notification-icon.png');

// Map markers, drawn at 3x like the Kotlin app's bitmaps (96 px ≈ 32 dp).
// Vehicles: a disc with a direction tip. White shapes, recoloured on the map (SDF icons):
// the outline layer is drawn white, the body in the line's colour.
const c = 48;
const r = 30;
const tip = (half, top) => `<path d="M${c},${top} L${c - half},${c - r + 8} L${c + half},${c - r + 8} Z" fill="#FFFFFF"/>`;
const veh = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">${body}</svg>`;
png(veh(`${tip(15, 1)}<circle cx="${c}" cy="${c}" r="${r + 3}" fill="#FFFFFF"/>`), 96, 'map/vehicle-outline-pointed@3x.png');
png(veh(`<circle cx="${c}" cy="${c}" r="${r + 3}" fill="#FFFFFF"/>`), 96, 'map/vehicle-outline@3x.png');
png(veh(`${tip(10, 7)}<circle cx="${c}" cy="${c}" r="${r}" fill="#FFFFFF"/>`), 96, 'map/vehicle-body-pointed@3x.png');
png(veh(`<circle cx="${c}" cy="${c}" r="${r}" fill="#FFFFFF"/>`), 96, 'map/vehicle-body@3x.png');

// Google-Maps-style heading beam: a blue 70° wedge pointing up (north), fading out from the dot.
const s = 264;
const h = s / 2;
const a = (deg) => [h + h * Math.cos((deg * Math.PI) / 180), h + h * Math.sin((deg * Math.PI) / 180)];
const [x1, y1] = a(-125);
const [x2, y2] = a(-55);
png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}">
  <defs><radialGradient id="g" cx="${h}" cy="${h}" r="${h}" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="${BRAND}" stop-opacity="0.65"/><stop offset="0.55" stop-color="${BRAND}" stop-opacity="0.3"/>
    <stop offset="1" stop-color="${BRAND}" stop-opacity="0"/></radialGradient></defs>
  <path d="M${h},${h} L${x1},${y1} A${h},${h} 0 0 1 ${x2},${y2} Z" fill="url(#g)"/></svg>`, s, 'map/heading-beam@3x.png');

console.log('assets written to', out);
