// Pembuat PDF minimal tanpa dependensi: teks Helvetica bawaan (WinAnsi), kotak, dan garis.
// Koordinat y dihitung dari atas halaman, seperti pada layar.
const encode = value => Buffer.from(String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e\xa0-\xff]/g, '?'), 'latin1');
const escapeText = buffer => Buffer.from(buffer.toString('latin1').replace(/[\\()]/g, match => '\\' + match), 'latin1');
const number = value => String(Math.round(value * 100) / 100);
const color = rgb => rgb.map(number).join(' ');

export const textWidth = (value, size) => String(value).length * size * 0.55; // perkiraan untuk rata kanan angka

class Page {
  constructor(width, height) { this.width = width; this.height = height; this.parts = []; }
  text(x, y, size, value, { bold = false, rgb = [0, 0, 0], align = 'left' } = {}) {
    const left = align === 'right' ? x - textWidth(value, size) : align === 'center' ? x - textWidth(value, size) / 2 : x;
    this.parts.push(Buffer.concat([Buffer.from(`BT ${color(rgb)} rg /${bold ? 'F2' : 'F1'} ${number(size)} Tf ${number(left)} ${number(this.height - y)} Td (`, 'latin1'),
      escapeText(encode(value)), Buffer.from(') Tj ET\n', 'latin1')]));
  }
  rect(x, y, width, height, rgb) {
    this.parts.push(Buffer.from(`${color(rgb)} rg ${number(x)} ${number(this.height - y - height)} ${number(width)} ${number(height)} re f\n`, 'latin1'));
  }
  line(x1, y1, x2, y2, rgb, weight = 0.5) {
    this.parts.push(Buffer.from(`${color(rgb)} RG ${number(weight)} w ${number(x1)} ${number(this.height - y1)} m ${number(x2)} ${number(this.height - y2)} l S\n`, 'latin1'));
  }
}

export class PdfDocument {
  constructor({ title = '', width = 595.28, height = 841.89 } = {}) { this.title = title; this.width = width; this.height = height; this.pages = []; }
  addPage() { const page = new Page(this.width, this.height); this.pages.push(page); return page; }
  toBuffer() {
    const objects = [];
    const pageNumbers = this.pages.map((_, index) => 5 + index * 2);
    objects.push(Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1'));
    objects.push(Buffer.from(`<< /Type /Pages /Kids [${pageNumbers.map(id => id + ' 0 R').join(' ')}] /Count ${this.pages.length} >>`, 'latin1'));
    objects.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'latin1'));
    objects.push(Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>', 'latin1'));
    for (const [index, page] of this.pages.entries()) {
      const content = Buffer.concat(page.parts);
      objects.push(Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${number(this.width)} ${number(this.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + index * 2} 0 R >>`, 'latin1'));
      objects.push(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'), content, Buffer.from('\nendstream', 'latin1')]));
    }
    const info = objects.length + 1;
    objects.push(Buffer.concat([Buffer.from('<< /Title (', 'latin1'), escapeText(encode(this.title)), Buffer.from(') /Producer (Snappie Studio) >>', 'latin1')]));
    const chunks = [Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
    const offsets = [];
    let size = chunks[0].length;
    for (const [index, body] of objects.entries()) {
      offsets.push(size);
      const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`, 'latin1'), body, Buffer.from('\nendobj\n', 'latin1')]);
      chunks.push(chunk); size += chunk.length;
    }
    const table = ['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ', ...offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n ')].join('\n') + '\n';
    chunks.push(Buffer.from(`${table}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${size}\n%%EOF\n`, 'latin1'));
    return Buffer.concat(chunks);
  }
}
