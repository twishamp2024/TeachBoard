/**
 * Built-in teaching symbols. All drawings are original SVG created for this
 * application. Each is inserted as a scalable image object.
 */

export interface BuiltinItem {
  id: string
  name: string
  w: number
  h: number
  svg: string
}

export interface BuiltinLibrary {
  id: string
  name: string
  items: BuiltinItem[]
}

const INK = '#1E2228'
const ACCENT = '#0F8B78'
const SOFT = '#DCEFEA'

function svg(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" font-family="Inter, Arial, sans-serif">${body}</g></svg>`
}

function item(id: string, name: string, w: number, h: number, body: string): BuiltinItem {
  return { id, name, w, h, svg: svg(w, h, body) }
}

const text = (x: number, y: number, t: string, size = 22, anchor = 'middle', extra = '') =>
  `<text x="${x}" y="${y}" font-size="${size}" text-anchor="${anchor}" fill="${INK}" stroke="none" ${extra}>${t}</text>`

// ---------------------------------------------------------------------------

const electrical: BuiltinItem[] = [
  item('el-resistor', 'Resistor', 160, 50, `<path d="M0 25 H40 L46 10 L58 40 L70 10 L82 40 L94 10 L106 40 L114 25 H160"/>`),
  item('el-resistor-iec', 'Resistor (box)', 160, 50, `<path d="M0 25 H45 M115 25 H160"/><rect x="45" y="12" width="70" height="26"/>`),
  item('el-variable-resistor', 'Variable resistor', 160, 80, `<path d="M0 40 H45 M115 40 H160"/><rect x="45" y="27" width="70" height="26"/><path d="M48 70 L112 10"/><path d="M112 10 L98 13 M112 10 L109 24"/>`),
  item('el-capacitor', 'Capacitor', 140, 70, `<path d="M0 35 H62 M78 35 H140 M62 10 V60 M78 10 V60"/>`),
  item('el-inductor', 'Inductor', 170, 50, `<path d="M0 35 H30 a12 12 0 0 1 24 0 a12 12 0 0 1 24 0 a12 12 0 0 1 24 0 a12 12 0 0 1 24 0 H170"/>`),
  item('el-cell', 'Cell', 140, 70, `<path d="M0 35 H62 M78 35 H140"/><path d="M62 8 V62" stroke-width="3"/><path d="M78 22 V48" stroke-width="6"/>${text(55, 18, '+', 18)}`),
  item('el-battery', 'Battery', 180, 70, `<path d="M0 35 H50 M130 35 H180 M50 8 V62 M66 22 V48 M114 8 V62 M130 22 V48" /><path d="M76 35 H104" stroke-dasharray="3 6"/>`),
  item('el-ac', 'AC source', 140, 80, `<path d="M0 40 H40 M100 40 H140"/><circle cx="70" cy="40" r="30"/><path d="M52 40 C58 24 64 24 70 40 S82 56 88 40"/>`),
  item('el-lamp', 'Lamp', 140, 80, `<path d="M0 40 H40 M100 40 H140"/><circle cx="70" cy="40" r="30"/><path d="M49 19 L91 61 M91 19 L49 61"/>`),
  item('el-switch-open', 'Switch (open)', 150, 60, `<path d="M0 45 H45 M105 45 H150"/><circle cx="45" cy="45" r="4" fill="${INK}"/><circle cx="105" cy="45" r="4" fill="${INK}"/><path d="M45 45 L98 16"/>`),
  item('el-switch-closed', 'Switch (closed)', 150, 60, `<path d="M0 45 H150"/><circle cx="45" cy="45" r="4" fill="${INK}"/><circle cx="105" cy="45" r="4" fill="${INK}"/>`),
  item('el-diode', 'Diode', 150, 70, `<path d="M0 35 H50 M100 35 H150"/><path d="M50 12 L90 35 L50 58 Z" fill="${SOFT}"/><path d="M90 12 V58"/>`),
  item('el-led', 'LED', 150, 90, `<path d="M0 55 H50 M100 55 H150"/><path d="M50 32 L90 55 L50 78 Z" fill="${SOFT}"/><path d="M90 32 V78"/><path d="M78 26 L92 8 M92 8 L84 10 M92 8 L91 16 M94 32 L108 14 M108 14 L100 16 M108 14 L107 22"/>`),
  item('el-ammeter', 'Ammeter', 140, 80, `<path d="M0 40 H40 M100 40 H140"/><circle cx="70" cy="40" r="30"/>${text(70, 49, 'A', 26, 'middle', 'font-weight="700"')}`),
  item('el-voltmeter', 'Voltmeter', 140, 80, `<path d="M0 40 H40 M100 40 H140"/><circle cx="70" cy="40" r="30"/>${text(70, 49, 'V', 26, 'middle', 'font-weight="700"')}`),
  item('el-ground', 'Earth / ground', 80, 80, `<path d="M40 0 V36 M14 36 H66 M22 48 H58 M31 60 H49"/>`),
  item('el-fuse', 'Fuse', 160, 50, `<path d="M0 25 H45 M115 25 H160"/><rect x="45" y="13" width="70" height="24"/><path d="M45 25 H115"/>`),
  item('el-motor', 'Motor', 140, 80, `<path d="M0 40 H40 M100 40 H140"/><circle cx="70" cy="40" r="30"/>${text(70, 49, 'M', 26, 'middle', 'font-weight="700"')}`),
  item('el-junction', 'Junction', 120, 80, `<path d="M0 40 H120 M60 40 V80"/><circle cx="60" cy="40" r="6" fill="${INK}"/>`)
]

const physics: BuiltinItem[] = [
  item('ph-incline', 'Inclined plane', 260, 150, `<path d="M10 140 H250 V30 Z" fill="${SOFT}"/><g transform="rotate(-24.6 150 88)"><rect x="128" y="50" width="54" height="38" fill="#FFFFFF"/></g><path d="M210 140 A40 40 0 0 0 214 125"/>${text(196, 132, 'θ', 18)}`),
  item('ph-pulley', 'Pulley', 160, 220, `<path d="M20 10 H140" stroke-width="5"/><path d="M80 10 V50"/><circle cx="80" cy="70" r="26" fill="${SOFT}"/><circle cx="80" cy="70" r="4" fill="${INK}"/><path d="M54 70 V160 M106 70 V130"/><rect x="34" y="160" width="40" height="40" fill="#FFFFFF"/><rect x="88" y="130" width="36" height="34" fill="#FFFFFF"/>`),
  item('ph-spring', 'Spring', 220, 60, `<path d="M0 30 H30 L40 8 L55 52 L70 8 L85 52 L100 8 L115 52 L130 8 L145 52 L160 8 L175 52 L185 30 H220"/>`),
  item('ph-pendulum', 'Pendulum', 160, 220, `<path d="M20 10 H140" stroke-width="5"/><path d="M80 10 L120 170"/><path d="M80 10 V190" stroke-dasharray="6 6" stroke-width="2"/><circle cx="122" cy="180" r="16" fill="${SOFT}"/><path d="M80 60 A50 50 0 0 0 92 58"/>${text(96, 80, 'θ', 18)}`),
  item('ph-convex-lens', 'Convex lens', 260, 160, `<path d="M0 80 H260" stroke-dasharray="8 6" stroke-width="2"/><path d="M130 10 C160 50 160 110 130 150 C100 110 100 50 130 10 Z" fill="${SOFT}"/><circle cx="60" cy="80" r="4" fill="${INK}"/><circle cx="200" cy="80" r="4" fill="${INK}"/>${text(60, 104, 'F', 18)}${text(200, 104, 'F', 18)}`),
  item('ph-concave-lens', 'Concave lens', 260, 160, `<path d="M0 80 H260" stroke-dasharray="8 6" stroke-width="2"/><path d="M112 10 H148 C132 50 132 110 148 150 H112 C128 110 128 50 112 10 Z" fill="${SOFT}"/>`),
  item('ph-magnet', 'Bar magnet', 240, 70, `<rect x="10" y="10" width="110" height="50" fill="#F4C7C7"/><rect x="120" y="10" width="110" height="50" fill="#C9DAF5"/>${text(65, 45, 'N', 26, 'middle', 'font-weight="700"')}${text(175, 45, 'S', 26, 'middle', 'font-weight="700"')}`),
  item('ph-wave', 'Transverse wave', 300, 120, `<path d="M0 60 H300" stroke-dasharray="6 6" stroke-width="2"/><path d="M0 60 C25 0 50 0 75 60 S125 120 150 60 S200 0 225 60 S275 120 300 60" stroke="${ACCENT}" stroke-width="4"/><path d="M37 16 V60 M37 16 L33 24 M37 16 L41 24"/>${text(52, 34, 'A', 16)}`),
  item('ph-prism', 'Prism', 220, 190, `<path d="M110 10 L210 180 H10 Z" fill="${SOFT}"/>`),
  item('ph-mass', 'Mass', 110, 90, `<rect x="10" y="10" width="90" height="70" fill="#FFFFFF"/>${text(55, 54, 'm', 30, 'middle', 'font-style="italic"')}`),
  item('ph-forces', 'Free-body diagram', 220, 220, `<rect x="80" y="80" width="60" height="60" fill="${SOFT}"/><g stroke="${ACCENT}" stroke-width="4"><path d="M110 80 V20 M110 20 L102 34 M110 20 L118 34"/><path d="M110 140 V200 M110 200 L102 186 M110 200 L118 186"/><path d="M140 110 H200 M200 110 L186 102 M200 110 L186 118"/><path d="M80 110 H20 M20 110 L34 102 M20 110 L34 118"/></g>${text(124, 30, 'N', 18, 'start')}${text(124, 204, 'W', 18, 'start')}${text(200, 98, 'F', 18, 'end')}${text(20, 98, 'f', 18, 'start')}`)
]

const tick = (x: number, y: number) => `<path d="M${x} ${y - 8} V${y + 8}"/>`

const math: BuiltinItem[] = [
  item(
    'ma-number-line',
    'Number line',
    480,
    80,
    `<path d="M10 30 H470 M470 30 L458 22 M470 30 L458 38 M10 30 L22 22 M10 30 L22 38"/>${Array.from({ length: 11 }, (_, i) => tick(40 + i * 40, 30) + text(40 + i * 40, 66, String(i - 5), 18)).join('')}`
  ),
  item(
    'ma-axes',
    'Coordinate axes',
    300,
    300,
    `<g stroke-width="1" stroke="#B9C2CC">${Array.from({ length: 11 }, (_, i) => `<path d="M${30 + i * 24} 30 V270 M30 ${30 + i * 24} H270"/>`).join('')}</g><path d="M10 150 H290 M290 150 L278 143 M290 150 L278 157 M150 290 V10 M150 10 L143 22 M150 10 L157 22"/>${text(284, 140, 'x', 18, 'end', 'font-style="italic"')}${text(162, 22, 'y', 18, 'start', 'font-style="italic"')}`
  ),
  item(
    'ma-unit-circle',
    'Unit circle',
    300,
    300,
    `<path d="M10 150 H290 M150 290 V10" stroke-width="2"/><circle cx="150" cy="150" r="110"/><path d="M150 150 L245 95" stroke="${ACCENT}"/><path d="M245 95 V150" stroke-dasharray="5 5" stroke-width="2"/><path d="M185 150 A35 35 0 0 0 180 133"/>${text(196, 144, 'θ', 18)}${text(268, 92, '(cos θ, sin θ)', 15, 'start')}${text(266, 168, '1', 16)}`
  ),
  item('ma-right-triangle', 'Right triangle', 260, 200, `<path d="M20 180 H240 V20 Z" fill="${SOFT}"/><path d="M220 180 V160 H240"/>${text(130, 198, 'b', 20, 'middle', 'font-style="italic"')}${text(252, 104, 'a', 20, 'start', 'font-style="italic"')}${text(116, 90, 'c', 20, 'middle', 'font-style="italic"')}`),
  item('ma-angle', 'Angle', 220, 160, `<path d="M20 140 H210 M20 140 L170 20"/><path d="M70 140 A50 50 0 0 0 59 109" stroke="${ACCENT}"/>${text(88, 128, 'α', 20)}`),
  item('ma-fraction-bar', 'Fraction bars', 320, 120, `<rect x="10" y="10" width="300" height="40" fill="${SOFT}"/>${text(160, 38, '1', 20)}${[0, 1, 2, 3].map((i) => `<rect x="${10 + i * 75}" y="66" width="75" height="40" ${i === 0 ? `fill="${ACCENT}" fill-opacity="0.35"` : 'fill="#FFFFFF"'}/>` + text(47 + i * 75, 93, '¼', 20)).join('')}`),
  item('ma-pie', 'Circle in eighths', 220, 220, `<circle cx="110" cy="110" r="100" fill="#FFFFFF"/><path d="M110 110 L110 10 A100 100 0 0 1 180.7 39.3 Z" fill="${ACCENT}" fill-opacity="0.35"/>${Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return `<path d="M110 110 L${(110 + Math.sin(a) * 100).toFixed(1)} ${(110 - Math.cos(a) * 100).toFixed(1)}"/>` }).join('')}`),
  item(
    'ma-clock',
    'Clock face',
    240,
    240,
    `<circle cx="120" cy="120" r="110" fill="#FFFFFF"/>${Array.from({ length: 12 }, (_, i) => {
      const a = ((i + 1) * Math.PI) / 6
      return text(120 + Math.sin(a) * 86, 128 - Math.cos(a) * 86, String(i + 1), 20)
    }).join('')}${Array.from({ length: 60 }, (_, i) => {
      const a = (i * Math.PI) / 30
      const r1 = i % 5 === 0 ? 100 : 104
      return `<path stroke-width="${i % 5 === 0 ? 3 : 1.5}" d="M${(120 + Math.sin(a) * r1).toFixed(1)} ${(120 - Math.cos(a) * r1).toFixed(1)} L${(120 + Math.sin(a) * 110).toFixed(1)} ${(120 - Math.cos(a) * 110).toFixed(1)}"/>`
    }).join('')}<path d="M120 120 L120 62" stroke-width="5"/><path d="M120 120 L160 120" stroke-width="7"/><circle cx="120" cy="120" r="6" fill="${INK}"/>`
  ),
  item('ma-cube', 'Cube', 200, 200, `<path d="M30 70 H130 V170 H30 Z" fill="${SOFT}"/><path d="M30 70 L70 30 H170 L130 70 M170 30 V130 L130 170"/><path d="M30 170 L70 130 H170 M70 130 V30" stroke-dasharray="6 6" stroke-width="2"/>`),
  item('ma-cylinder', 'Cylinder', 160, 220, `<ellipse cx="80" cy="35" rx="60" ry="20" fill="${SOFT}"/><path d="M20 35 V185 M140 35 V185"/><path d="M20 185 A60 20 0 0 0 140 185"/><path d="M20 185 A60 20 0 0 1 140 185" stroke-dasharray="6 6" stroke-width="2"/>`),
  item('ma-cone', 'Cone', 180, 220, `<path d="M90 15 L20 185 M90 15 L160 185"/><path d="M20 185 A70 22 0 0 0 160 185"/><path d="M20 185 A70 22 0 0 1 160 185" stroke-dasharray="6 6" stroke-width="2"/><path d="M90 15 V185 H160" stroke-dasharray="4 5" stroke-width="2"/>${text(98, 120, 'h', 18, 'start', 'font-style="italic"')}${text(124, 204, 'r', 18, 'middle', 'font-style="italic"')}`),
  item('ma-venn', 'Venn diagram', 300, 200, `<circle cx="115" cy="100" r="80" fill="${ACCENT}" fill-opacity="0.18"/><circle cx="185" cy="100" r="80" fill="#5B4FD8" fill-opacity="0.16"/>${text(80, 106, 'A', 24)}${text(220, 106, 'B', 24)}`)
]

const chemistry: BuiltinItem[] = [
  item('ch-beaker', 'Beaker', 160, 200, `<path d="M20 10 H140 M30 10 V180 Q30 190 40 190 H120 Q130 190 130 180 V10"/><path d="M33 110 H127 V178 Q127 187 118 187 H42 Q33 187 33 178 Z" fill="#9FD8F0" stroke="none"/><path d="M30 60 H50 M30 90 H44 M30 120 H50 M30 150 H44"/>`),
  item('ch-flask', 'Conical flask', 180, 210, `<path d="M70 10 H110 M75 10 V70 L20 190 H160 L105 70 V10"/><path d="M40 146 H140 L158 186 H22 Z" fill="#B7E4C7" stroke="none"/><path d="M75 70 L20 190 H160 L105 70"/>`),
  item('ch-test-tube', 'Test tube', 70, 220, `<path d="M15 10 H55 M20 10 V180 A15 15 0 0 0 50 180 V10"/><path d="M22 120 H48 V180 A13 13 0 0 1 22 180 Z" fill="#F6C1C1" stroke="none"/>`),
  item('ch-round-flask', 'Round-bottom flask', 180, 210, `<path d="M72 10 H108 M76 10 V80 A70 70 0 1 0 104 80 V10"/><path d="M28 150 A62 62 0 0 0 152 150 Z" fill="#D9C9F2" stroke="none"/>`),
  item('ch-benzene', 'Benzene ring', 180, 180, `<path d="M90 15 L155 52.5 V127.5 L90 165 L25 127.5 V52.5 Z"/><circle cx="90" cy="90" r="42"/>`),
  item('ch-atom', 'Atom (Bohr model)', 240, 240, `<circle cx="120" cy="120" r="22" fill="#F4C7C7"/>${text(120, 128, '+', 22)}<circle cx="120" cy="120" r="60" stroke-width="2"/><circle cx="120" cy="120" r="100" stroke-width="2"/><circle cx="180" cy="120" r="8" fill="${ACCENT}" stroke="none"/><circle cx="60" cy="120" r="8" fill="${ACCENT}" stroke="none"/><circle cx="120" cy="20" r="8" fill="${ACCENT}" stroke="none"/><circle cx="191" cy="191" r="8" fill="${ACCENT}" stroke="none"/><circle cx="49" cy="191" r="8" fill="${ACCENT}" stroke="none"/>`),
  item('ch-burner', 'Bunsen burner', 150, 230, `<path d="M55 90 H95 V190 H55 Z" fill="${SOFT}"/><path d="M25 190 H125 V215 H25 Z"/><path d="M75 85 C55 60 70 40 75 15 C80 40 95 60 75 85 Z" fill="#9DC3F7"/><path d="M75 80 C66 66 72 54 75 42 C78 54 84 66 75 80 Z" fill="#F2B84B" stroke="none"/><path d="M95 160 H118"/>`)
]

const biology: BuiltinItem[] = [
  item('bi-animal-cell', 'Animal cell', 260, 200, `<path d="M40 100 C30 40 100 15 150 25 C220 35 245 80 230 130 C215 180 140 190 90 175 C55 165 45 140 40 100 Z" fill="#FCE3D6"/><circle cx="135" cy="100" r="32" fill="#E7B9A6"/><circle cx="140" cy="96" r="10" fill="#B9776A" stroke="none"/><ellipse cx="85" cy="70" rx="18" ry="8" fill="#F6CBA9"/><ellipse cx="190" cy="140" rx="16" ry="7" fill="#F6CBA9"/>`),
  item('bi-plant-cell', 'Plant cell', 260, 200, `<rect x="15" y="15" width="230" height="170" rx="12" fill="#DDF1D5" stroke-width="5"/><rect x="28" y="28" width="204" height="144" rx="8"/><rect x="60" y="55" width="110" height="90" rx="20" fill="#E9F7FD"/><circle cx="196" cy="62" r="22" fill="#C9E3B9"/><ellipse cx="200" cy="140" rx="16" ry="8" fill="#7EC46B" stroke="none"/><ellipse cx="45" cy="155" rx="12" ry="6" fill="#7EC46B" stroke="none"/>`)
]

export const BUILTIN_LIBRARIES: BuiltinLibrary[] = [
  { id: 'electrical', name: 'Electrical', items: electrical },
  { id: 'physics', name: 'Physics', items: physics },
  { id: 'math', name: 'Mathematics', items: math },
  { id: 'chemistry', name: 'Chemistry', items: chemistry },
  { id: 'biology', name: 'Biology', items: biology }
]
