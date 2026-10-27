"""Generate actual PDF/XLSX files using only the Python standard library.

The PDF embeds an installed TrueType font and its Unicode mapping; it is a
normal vector-text invoice, not a pdf.js/XLSX mock. Nothing is written to git.
"""
import json
import pathlib
import struct
import sys
import zipfile
import zlib
from xml.sax.saxutils import escape

destination = pathlib.Path(sys.argv[1])
destination.mkdir(parents=True, exist_ok=True)


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


def vector_pdf(path):
    font_paths = ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                  '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf']
    font_path = next((pathlib.Path(p) for p in font_paths if pathlib.Path(p).exists()), None)
    if font_path is None:
        raise RuntimeError('Real PDF fixture requires the installed DejaVuSans or LiberationSans TrueType font')
    font = font_path.read_bytes()
    count = struct.unpack_from('>H', font, 4)[0]
    tables = {font[12 + i * 16:16 + i * 16]: struct.unpack_from('>I', font, 20 + i * 16)[0]
              for i in range(count)}
    cmap_offset = tables[b'cmap']
    cmap_count = struct.unpack_from('>H', font, cmap_offset + 2)[0]
    cmaps = []
    for i in range(cmap_count):
        relative = struct.unpack_from('>I', font, cmap_offset + 8 + i * 8)[0]
        offset = cmap_offset + relative
        if struct.unpack_from('>H', font, offset)[0] == 4:
            cmaps.append(offset)
    if not cmaps:
        raise RuntimeError('Installed TrueType font has no Unicode format-4 cmap')
    cmap = cmaps[0]
    segments = struct.unpack_from('>H', font, cmap + 6)[0] // 2
    end_start = cmap + 14
    start_start = end_start + segments * 2 + 2
    delta_start = start_start + segments * 2
    range_start = delta_start + segments * 2

    def glyph(code):
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

    # These are the production parser's documented invoice column positions.
    texts = [(86, 700, '1'), (100, 700, 'Audit pipe'), (300, 700, 'м'),
             (340, 700, '2'), (380, 700, '100'), (610, 700, '244'),
             (35, 660, 'Всего к оплате'), (610, 660, '244')]
    characters = sorted(set(''.join(text for _, _, text in texts)))
    cid_map = bytearray((ord(characters[-1]) + 1) * 2)
    for char in characters:
        struct.pack_into('>H', cid_map, ord(char) * 2, glyph(ord(char)))
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


def scanned_pdf(path):
    write_pdf(path, [b'<< /Type /Catalog /Pages 2 0 R >>',
                    b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
                    b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 850 800] /Resources << /XObject << /Im 5 0 R >> >> /Contents 4 0 R >>',
                    stream(b'q 700 0 0 700 30 30 cm /Im Do Q'),
                    stream(zlib.compress(bytes([255, 255, 255, 30, 30, 30, 30, 30, 30, 255, 255, 255])),
                           b'/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode')])


xlsx(destination / 'invoice.xlsx')
vector_pdf(destination / 'invoice.pdf')
scanned_pdf(destination / 'scanned.pdf')
print(json.dumps({name: str(destination / name) for name in ['invoice.xlsx', 'invoice.pdf', 'scanned.pdf']}))
