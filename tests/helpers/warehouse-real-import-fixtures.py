"""Generate actual PDF/XLSX files using only the Python standard library.

The PDF embeds an installed TrueType font and its Unicode mapping; it is a
normal vector-text invoice, not a pdf.js/XLSX mock. Nothing is written to git.
"""
import json
import os
import pathlib
import shutil
import struct
import sys
import tempfile
import zipfile
import zlib
from xml.sax.saxutils import escape

TEXTS = [(86, 700, '1'), (100, 700, 'Audit pipe'), (300, 700, 'м'),
         (340, 700, '2'), (380, 700, '100'), (610, 700, '244'),
         (35, 660, 'Всего к оплате'), (610, 660, '244')]
CHARACTERS = sorted(set(''.join(text for _, _, text in TEXTS)))


def xlsx(path):
    values = [['Наименование', 'Количество', 'Ед изм', 'Цена', 'Сумма'],
              ['Audit pipe', 2, 'м', 100, 244]]
    rows = []
    for number, values_row in enumerate(values, 1):
        cells = []
        for column, value in enumerate(values_row):
            address = chr(65 + column) + str(number)
            cells.append(f'<c r="{address}"><v>{value}</v></c>' if isinstance(value, (int, float))
                         else f'<c r="{address}" t="inlineStr"><is><t>{escape(value)}</t></is></c>')
        rows.append(f'<row r="{number}">{"".join(cells)}</row>')
    files = {
        '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Invoice" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml': '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' + ''.join(rows) + '</sheetData></worksheet>',
    }
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content)


def write_pdf(path, objects):
    data = bytearray(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(data))
        data.extend(f'{number} 0 obj\n'.encode() + obj + b'\nendobj\n')
    xref = len(data)
    data.extend(f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode())
    for offset in offsets[1:]:
        data.extend(f'{offset:010} 00000 n \n'.encode())
    data.extend(f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode())
    path.write_bytes(data)


def stream(data, attributes=b''):
    return b'<< /Length ' + str(len(data)).encode() + b' ' + attributes + b' >>\nstream\n' + data + b'\nendstream'


def unicode_font(path, characters):
    """Read embeddable TrueType glyphs; reject symbol/CFF/incomplete fonts."""
    font = path.read_bytes()
    if font[:4] not in (b'\x00\x01\x00\x00', b'true'):
        raise ValueError('not a TrueType outline font')
    count = struct.unpack_from('>H', font, 4)[0]
    tables = {font[12 + i * 16:16 + i * 16]: struct.unpack_from('>I', font, 20 + i * 16)[0]
              for i in range(count)}
    if not {b'cmap', b'glyf', b'loca', b'maxp'}.issubset(tables):
        raise ValueError('missing TrueType outline/Unicode tables')
    glyph_count = struct.unpack_from('>H', font, tables[b'maxp'] + 4)[0]
    cmap_offset = tables[b'cmap']
    cmap_count = struct.unpack_from('>H', font, cmap_offset + 2)[0]
    cmaps = []
    for i in range(cmap_count):
        platform, encoding = struct.unpack_from('>HH', font, cmap_offset + 4 + i * 8)
        relative = struct.unpack_from('>I', font, cmap_offset + 8 + i * 8)[0]
        offset = cmap_offset + relative
        if (platform == 0 or platform == 3 and encoding in (1, 10)) and struct.unpack_from('>H', font, offset)[0] == 4:
            cmaps.append(offset)
    if not cmaps:
        raise ValueError('no Unicode format-4 cmap')

    def glyph(cmap, code):
        segments = struct.unpack_from('>H', font, cmap + 6)[0] // 2
        end_start = cmap + 14
        start_start = end_start + segments * 2 + 2
        delta_start = start_start + segments * 2
        range_start = delta_start + segments * 2
        for i in range(segments):
            end = struct.unpack_from('>H', font, end_start + i * 2)[0]
            start = struct.unpack_from('>H', font, start_start + i * 2)[0]
            if start <= code <= end:
                delta = struct.unpack_from('>h', font, delta_start + i * 2)[0]
                relative = struct.unpack_from('>H', font, range_start + i * 2)[0]
                if not relative:
                    return (code + delta) & 65535
                value = struct.unpack_from('>H', font, range_start + i * 2 + relative + 2 * (code - start))[0]
                return (value + delta) & 65535 if value else 0
        return 0

    for cmap in cmaps:
        glyphs = {ord(char): glyph(cmap, ord(char)) for char in characters}
        if all(0 < value < glyph_count for value in glyphs.values()):
            return font, glyphs
    raise ValueError('Unicode cmap does not cover every Latin/Cyrillic invoice character')


def discover_font(characters, directories=None, override=None):
    """Overrides make CI selection and missing-primary-path regressions reproducible."""
    explicit = os.environ.get('ARBAT_PDF_FIXTURE_FONT', '') if override is None else override
    configured = os.environ.get('ARBAT_PDF_FIXTURE_FONT_DIRS') if directories is None else None
    if explicit:
        candidates = [pathlib.Path(explicit).expanduser()]
    else:
        roots = directories if directories is not None else (
            configured.split(os.pathsep) if configured is not None else
            ['/usr/share/fonts', '/usr/local/share/fonts', '~/.fonts', '~/.local/share/fonts'])
        candidates = []
        for directory in roots:
            directory = pathlib.Path(directory).expanduser()
            if directory.is_dir():
                candidates.extend(p for p in directory.rglob('*') if p.suffix.lower() == '.ttf')

        def preference(path):
            name = path.name.lower()
            preferred = ['dejavusans.ttf', 'liberationsans-regular.ttf']
            return (preferred.index(name) if name in preferred else 2 if 'dejavu' in name or 'liberation' in name else 3, str(path))

        candidates.sort(key=preference)
    errors, seen = [], set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        try:
            font, glyphs = unicode_font(candidate, characters)
            return candidate, font, glyphs
        except (OSError, KeyError, ValueError, struct.error) as error:
            errors.append(f'{candidate}: {error}')
    detail = '; '.join(errors[:3]) or 'no .ttf candidates found in configured/installed font directories'
    raise RuntimeError('Real PDF fixture requires a TrueType font with Unicode format-4 coverage for every invoice character. '
                       'Set ARBAT_PDF_FIXTURE_FONT to a compatible .ttf path. ' + detail)


def vector_pdf(path):
    font_path, font, glyphs = discover_font(CHARACTERS)
    # These are the production parser's documented invoice column positions.
    texts, characters = TEXTS, CHARACTERS
    cid_map = bytearray((ord(characters[-1]) + 1) * 2)
    for char in characters:
        struct.pack_into('>H', cid_map, ord(char) * 2, glyphs[ord(char)])
    unicode_map = ('/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n'
                   '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n'
                   '/CMapName /AuditUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n'
                   f'{len(characters)} beginbfchar\n' +
                   '\n'.join(f'<{ord(c):04X}> <{ord(c):04X}>' for c in characters) +
                   '\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend').encode()
    content = '\n'.join(f'BT /F1 8 Tf 1 0 0 1 {x} {y} Tm <{text.encode("utf-16-be").hex()}> Tj ET'
                        for x, y, text in texts).encode()
    write_pdf(path, [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 850 800] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
        stream(content),
        b'<< /Type /Font /Subtype /Type0 /BaseFont /AuditFont /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 8 0 R >>',
        b'<< /Type /Font /Subtype /CIDFontType2 /BaseFont /AuditFont /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 7 0 R /CIDToGIDMap 10 0 R /DW 650 >>',
        b'<< /Type /FontDescriptor /FontName /AuditFont /Flags 32 /FontBBox [-1021 -463 1793 1232] /ItalicAngle 0 /Ascent 928 /Descent -236 /CapHeight 729 /StemV 80 /FontFile2 9 0 R >>',
        stream(unicode_map), stream(zlib.compress(font), b'/Filter /FlateDecode'),
        stream(bytes(cid_map)),
    ])
    return font_path


def scanned_pdf(path):
    write_pdf(path, [b'<< /Type /Catalog /Pages 2 0 R >>',
                    b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
                    b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 850 800] /Resources << /XObject << /Im 5 0 R >> >> /Contents 4 0 R >>',
                    stream(b'q 700 0 0 700 30 30 cm /Im Do Q'),
                    stream(zlib.compress(bytes([255, 255, 255, 30, 30, 30, 30, 30, 30, 255, 255, 255])),
                           b'/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode')])


def font_self_test():
    original, _, _ = discover_font(CHARACTERS)
    with tempfile.TemporaryDirectory(prefix='arbat-font-fallback-') as temporary:
        root = pathlib.Path(temporary)
        alternate = root / 'unlisted-layout' / 'invoice-compatible.ttf'
        alternate.parent.mkdir()
        shutil.copyfile(original, alternate)
        (root / 'DejaVuSans.ttf').write_bytes(b'invalid preferred font must be skipped')
        selected, _, _ = discover_font(CHARACTERS, directories=[root], override='')
        assert selected == alternate, (selected, alternate)
        assert discover_font(CHARACTERS, directories=[], override=str(alternate))[0] == alternate
        try:
            discover_font(CHARACTERS, directories=[], override=str(root / 'DejaVuSans.ttf'))
        except RuntimeError as error:
            assert 'Unicode format-4' in str(error)
        else:
            raise AssertionError('Explicit incompatible font must fail clearly')
        try:
            discover_font(CHARACTERS + ['\uffff'], directories=[], override=str(alternate))
        except RuntimeError as error:
            assert 'does not cover every' in str(error)
        else:
            raise AssertionError('A font missing a required Unicode glyph must be rejected')
        print('PASS: recursive fallback without primary known paths, invalid-font skip, explicit override, incompatible override and missing-glyph rejection')


if __name__ == '__main__':
    if sys.argv[1:] == ['--font-self-test']:
        font_self_test()
    else:
        destination = pathlib.Path(sys.argv[1])
        destination.mkdir(parents=True, exist_ok=True)
        xlsx(destination / 'invoice.xlsx')
        selected_font = vector_pdf(destination / 'invoice.pdf')
        scanned_pdf(destination / 'scanned.pdf')
        print(json.dumps({**{name: str(destination / name) for name in ['invoice.xlsx', 'invoice.pdf', 'scanned.pdf']},
                          'font': str(selected_font)}))
