#!/usr/bin/env node
/**
 * F5.4 课件保真样例集生成器（零外部依赖，仅 jszip；产物 .pptx 不入库）。
 *
 * 用法：node apps/server/scripts/generate-courseware-fixtures.mjs [--out <dir>]
 * 默认输出到 apps/server/test/fixtures/courseware/（gitignore 已忽略 *.pptx）。
 *
 * 覆盖六类保真损失分类（见同目录 README.md）。smartart 为图形组合近似
 * （原生 SmartArt XML 依赖 data1/diagrams 部件链，首期以结构等价的
 * 形状组合覆盖母版/形状渲染路径）；chart-embedded 含真实 chart part
 * 与嵌入 xlsx。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const here = dirname(fileURLToPath(import.meta.url));
const outFlag = process.argv.indexOf('--out');
const outDir =
  outFlag > -1 && process.argv[outFlag + 1]
    ? process.argv[outFlag + 1]
    : join(here, '..', 'test', 'fixtures', 'courseware');

const EMU = 914400; // 1 inch
const SLIDE_W = 12192000; // 16:9
const SLIDE_H = 6858000;

const esc = s =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

let shapeId = 1;
const nextId = () => ++shapeId;

function emptyTree(shapes = '') {
  return (
    '<p:spTree>' +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    shapes +
    '</p:spTree>'
  );
}

function solidFill(hex) {
  return `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
}

function gradFill(hex1, hex2, ang = 5400000) {
  return (
    '<a:gradFill rotWithShape="1"><a:gsLst>' +
    `<a:gs pos="0"><a:srgbClr val="${hex1}"/></a:gs>` +
    `<a:gs pos="100000"><a:srgbClr val="${hex2}"/></a:gs>` +
    `</a:gsLst><a:lin ang="${ang}" scaled="0"/></a:gradFill>`
  );
}

/** 文本框：runs = [{text, typeface?, sz?, b?, color?}] */
function textBox({ x, y, cx, cy, runs, align = 'l', rot = 0 }) {
  const id = nextId();
  const paras = runs
    .map(r => {
      const rPr = [
        'lang="zh-CN"',
        r.sz ? `sz="${r.sz}"` : 'sz="1800"',
        r.b ? 'b="1"' : '',
        r.color ? `spc="0"` : ''
      ]
        .filter(Boolean)
        .join(' ');
      const fill = r.color ? `<a:solidFill><a:srgbClr val="${r.color}"/></a:solidFill>` : '';
      const latin = r.typeface ? `<a:latin typeface="${esc(r.typeface)}"/>` : '';
      return `<a:p><a:pPr algn="${align}"/><a:r><a:rPr ${rPr} dirty="0">${fill}${latin}</a:rPr><a:t>${esc(r.text)}</a:t></a:r></a:p>`;
    })
    .join('');
  const rotAttr = rot ? ` rot="${rot}"` : '';
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="TextBox${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm${rotAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
    `<p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${paras}</p:txBody></p:sp>`
  );
}

/** 矩形/装饰块；fill 可为 solidFill/gradFill 片段 */
function rect({ x, y, cx, cy, fill, rot = 0, prst = 'rect', line }) {
  const id = nextId();
  const rotAttr = rot ? ` rot="${rot}"` : '';
  const ln = line
    ? `<a:ln w="12700"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>`
    : '<a:ln><a:noFill/></a:ln>';
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm${rotAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>${fill}${ln}</p:spPr>` +
    '<p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>'
  );
}

/** OMML 公式段（置于文本框内） */
function formulaBox({ x, y, cx, cy, math }) {
  const id = nextId();
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Formula${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
    '<p:txBody><a:bodyPr/><a:lstStyle/>' +
    `<a:p><m:oMathPara><m:oMath><m:r><m:t>${esc(math)}</m:t></m:r></m:oMath></m:oMathPara></a:p>` +
    '</p:txBody></p:sp>'
  );
}

/** 图表帧（引用 r:id 的 chart part） */
function chartFrame({ x, y, cx, cy, rid }) {
  const id = nextId();
  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Chart${id}"/>` +
    '<p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>' +
    `<p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></p:xfrm>` +
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">' +
    `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rid}"/>` +
    '</a:graphicData></a:graphic></p:graphicFrame>'
  );
}

function slideXml(shapes, { mathNs = false } = {}) {
  const extra = mathNs
    ? ' xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"'
    : '';
  return (
    XML_DECL +
    `<p:sld ${NS}${extra}><p:cSld>${emptyTree(shapes)}</p:cSld>` +
    '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
  );
}

const SLIDE_LAYOUT_REL =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout';
const SLIDE_MASTER_REL =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster';
const THEME_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme';
const CHART_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart';
const SLIDE_CT = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';

function relsXml(entries) {
  return (
    XML_DECL +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    entries
      .map(e => `<Relationship Id="${e.id}" Type="${e.type}" Target="${e.target}"/>`)
      .join('') +
    '</Relationships>'
  );
}

const THEME_XML =
  XML_DECL +
  '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Fixture">' +
  '<a:themeElements><a:clrScheme name="Fixture">' +
  '<a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="1F4E79"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2>' +
  '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>' +
  '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
  '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>' +
  '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>' +
  '</a:clrScheme>' +
  '<a:fontScheme name="Fixture"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
  '<a:fmtScheme name="Office">' +
  '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
  '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' +
  '<a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>' +
  '<a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
  '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle>' +
  '<a:effectStyle><a:effectLst/></a:effectStyle>' +
  '<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
  '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
  '</a:fmtScheme></a:themeElements></a:theme>';

const SLIDE_MASTER_XML =
  XML_DECL +
  `<p:sldMaster ${NS}><p:cSld>` +
  '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
  emptyTree() +
  '</p:cSld>' +
  '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" ' +
  'accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
  '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
  '</p:sldMaster>';

const SLIDE_LAYOUT_XML =
  XML_DECL +
  `<p:sldLayout ${NS} type="blank" preserve="1">` +
  '<p:cSld name="Blank">' +
  emptyTree() +
  '</p:cSld>' +
  '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';

function embeddedXlsx(rows) {
  // rows: [[label, value], ...]；首行为表头
  const sheetRows = rows
    .map(
      (cells, i) =>
        `<row r="${i + 1}">` +
        cells
          .map((v, j) => {
            const col = String.fromCharCode(65 + j);
            const ref = `${col}${i + 1}`;
            return typeof v === 'number'
              ? `<c r="${ref}"><v>${v}</v></c>`
              : `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
          })
          .join('') +
        '</row>'
    )
    .join('');
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    XML_DECL +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>'
  );
  zip.file(
    '_rels/.rels',
    relsXml([
      {
        id: 'rId1',
        type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
        target: 'xl/workbook.xml'
      }
    ])
  );
  zip.file(
    'xl/workbook.xml',
    XML_DECL +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    relsXml([
      {
        id: 'rId1',
        type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet',
        target: 'worksheets/sheet1.xml'
      }
    ])
  );
  zip.file(
    'xl/worksheets/sheet1.xml',
    XML_DECL +
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`
  );
  return zip;
}

function chartXml({ title, labels, values, type }) {
  const pts = (arr, fmt) =>
    arr.map((v, i) => `<c:pt idx="${i}"><c:v>${fmt ? esc(v) : v}</c:v></c:pt>`).join('');
  const chartChild =
    type === 'line'
      ? '<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>'
      : '<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>';
  const chartClose =
    type === 'line'
      ? '<c:marker val="1"/><c:axId val="111111111"/><c:axId val="222222222"/></c:lineChart>'
      : '<c:gapWidth val="150"/><c:axId val="111111111"/><c:axId val="222222222"/></c:barChart>';
  return (
    XML_DECL +
    '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" ' +
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<c:chart><c:plotArea><c:layout/>' +
    chartChild +
    '<c:ser><c:idx val="0"/><c:order val="0"/>' +
    `<c:tx><c:v>${esc(title)}</c:v></c:tx>` +
    `<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$${labels.length + 1}</c:f><c:strCache><c:ptCount val="${labels.length}"/>${pts(labels, true)}</c:strCache></c:strRef></c:cat>` +
    `<c:val><c:numRef><c:f>Sheet1!$B$2:$B$${values.length + 1}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${values.length}"/>${pts(values, false)}</c:numCache></c:numRef></c:val>` +
    '</c:ser>' +
    chartClose +
    '<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="minMax"/></c:scaling>' +
    '<c:delete val="0"/><c:axPos val="b"/><c:crossAx val="222222222"/></c:catAx>' +
    '<c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/></c:scaling>' +
    '<c:delete val="0"/><c:axPos val="l"/><c:crossAx val="111111111"/></c:valAx>' +
    '</c:plotArea><c:plotVisOnly val="1"/></c:chart>' +
    '<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData>' +
    '</c:chartSpace>'
  );
}

/**
 * 组装单个 pptx。slides: [{ xml, chart?: {name, xml, xlsx} }]
 */
async function buildPptx(slides) {
  const zip = new JSZip();
  const slideOverrides = slides
    .map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${SLIDE_CT}"/>`)
    .join('');
  const chartParts = slides
    .map((s, i) =>
      s.chart
        ? `<Override PartName="/ppt/charts/${s.chart.name}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
        : ''
    )
    .join('');
  zip.file(
    '[Content_Types].xml',
    XML_DECL +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      slideOverrides +
      chartParts +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>'
  );
  zip.file(
    '_rels/.rels',
    relsXml([
      {
        id: 'rId1',
        type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument',
        target: 'ppt/presentation.xml'
      },
      {
        id: 'rId2',
        type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
        target: 'docProps/core.xml'
      },
      {
        id: 'rId3',
        type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties',
        target: 'docProps/app.xml'
      }
    ])
  );
  zip.file(
    'docProps/core.xml',
    XML_DECL +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>courseware-fixtures</dc:creator>' +
      '<dc:title>F5.4 fidelity fixture</dc:title></cp:coreProperties>'
  );
  zip.file(
    'docProps/app.xml',
    XML_DECL +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
      '<Application>yunyan-live fixtures</Application></Properties>'
  );

  const sldIdLst = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('');
  zip.file(
    'ppt/presentation.xml',
    XML_DECL +
      `<p:presentation ${NS} saveSubsetFonts="1">` +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      `<p:sldIdLst>${sldIdLst}</p:sldIdLst>` +
      `<p:sldSz cx="${SLIDE_W}" cy="${SLIDE_H}"/><p:notesSz cx="6858000" cy="9144000"/>` +
      '</p:presentation>'
  );
  const presRels = [
    { id: 'rId1', type: SLIDE_MASTER_REL, target: 'slideMasters/slideMaster1.xml' },
    ...slides.map((_, i) => ({
      id: `rId${i + 2}`,
      type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
      target: `slides/slide${i + 1}.xml`
    })),
    {
      id: `rId${slides.length + 2}`,
      type: THEME_REL,
      target: 'theme/theme1.xml'
    }
  ];
  zip.file('ppt/_rels/presentation.xml.rels', relsXml(presRels));
  zip.file('ppt/slideMasters/slideMaster1.xml', SLIDE_MASTER_XML);
  zip.file(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    relsXml([
      { id: 'rId1', type: SLIDE_LAYOUT_REL, target: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', type: THEME_REL, target: '../theme/theme1.xml' }
    ])
  );
  zip.file('ppt/slideLayouts/slideLayout1.xml', SLIDE_LAYOUT_XML);
  zip.file(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    relsXml([{ id: 'rId1', type: SLIDE_MASTER_REL, target: '../slideMasters/slideMaster1.xml' }])
  );
  zip.file('ppt/theme/theme1.xml', THEME_XML);

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    zip.file(`ppt/slides/slide${i + 1}.xml`, s.xml);
    const slideRels = [
      { id: 'rId1', type: SLIDE_LAYOUT_REL, target: '../slideLayouts/slideLayout1.xml' }
    ];
    if (s.chart) {
      slideRels.push({ id: 'rId2', type: CHART_REL, target: `../charts/${s.chart.name}` });
      zip.file(`ppt/charts/${s.chart.name}`, s.chart.xml);
      zip.file(
        `ppt/charts/_rels/${s.chart.name}.rels`,
        relsXml([
          {
            id: 'rId1',
            type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package',
            target: `../embeddings/${s.chart.xlsxName}`
          }
        ])
      );
      zip.file(
        `ppt/embeddings/${s.chart.xlsxName}`,
        await s.chart.xlsx.generateAsync({ type: 'nodebuffer' })
      );
    }
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, relsXml(slideRels));
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ---- 六类样例定义 ----

function caseFontMissing() {
  return {
    id: 'font-missing',
    file: 'font-missing.pptx',
    expectedPages: 1,
    note: '小众字体（方正兰亭）文本框，转换机无此字体应触发字体替换',
    slides: [
      {
        xml: slideXml(
          textBox({
            x: 0.8 * EMU,
            y: 1 * EMU,
            cx: 10 * EMU,
            cy: 2 * EMU,
            runs: [{ text: '字体替换样例：云砚直播课堂', typeface: 'FZLanTingHei-R-GBK', sz: 3200 }]
          }) +
            textBox({
              x: 0.8 * EMU,
              y: 3.2 * EMU,
              cx: 10 * EMU,
              cy: 2 * EMU,
              runs: [
                {
                  text: 'The quick brown fox — FZLanTingHei sample 0123456789',
                  typeface: 'FZLanTingHei-R-GBK',
                  sz: 2400
                }
              ]
            })
        )
      }
    ]
  };
}

function caseFontInstalled() {
  return {
    id: 'font-installed',
    file: 'font-installed.pptx',
    expectedPages: 1,
    note: '同内容改用 Noto Sans CJK SC（部署机必装，对照组）',
    slides: [
      {
        xml: slideXml(
          textBox({
            x: 0.8 * EMU,
            y: 1 * EMU,
            cx: 10 * EMU,
            cy: 2 * EMU,
            runs: [{ text: '字体对照样例：云砚直播课堂', typeface: 'Noto Sans CJK SC', sz: 3200 }]
          }) +
            textBox({
              x: 0.8 * EMU,
              y: 3.2 * EMU,
              cx: 10 * EMU,
              cy: 2 * EMU,
              runs: [
                {
                  text: 'The quick brown fox — Noto sample 0123456789',
                  typeface: 'Noto Sans CJK SC',
                  sz: 2400
                }
              ]
            })
        )
      }
    ]
  };
}

function caseMasterComplex() {
  return {
    id: 'master-complex',
    file: 'master-complex.pptx',
    expectedPages: 2,
    note: '多层背景 + 斜切装饰 + 渐变标题（母版/主题渲染压力）',
    slides: [
      {
        xml: slideXml(
          rect({ x: 0, y: 0, cx: SLIDE_W, cy: SLIDE_H, fill: solidFill('F2F5FA') }) +
            rect({ x: 0, y: 0, cx: 2.2 * EMU, cy: SLIDE_H, fill: gradFill('1F4E79', '2E75B6') }) +
            rect({
              x: 2 * EMU,
              y: 0.6 * EMU,
              cx: 3 * EMU,
              cy: 0.6 * EMU,
              fill: solidFill('ED7D31'),
              rot: 2700000,
              prst: 'parallelogram'
            }) +
            textBox({
              x: 3 * EMU,
              y: 0.8 * EMU,
              cx: 8 * EMU,
              cy: 1.2 * EMU,
              runs: [
                {
                  text: '渐变标题母版页 1/2',
                  typeface: 'Noto Sans CJK SC',
                  sz: 3600,
                  b: true,
                  color: '1F4E79'
                }
              ]
            }) +
            rect({
              x: 3 * EMU,
              y: 5.5 * EMU,
              cx: 8.5 * EMU,
              cy: 0.15 * EMU,
              fill: gradFill('ED7D31', 'FFC000', 0)
            })
        )
      },
      {
        xml: slideXml(
          rect({
            x: 0,
            y: 0,
            cx: SLIDE_W,
            cy: SLIDE_H,
            fill: gradFill('FFFFFF', 'D6E4F0', 2700000)
          }) +
            rect({ x: 8.5 * EMU, y: 0, cx: 4 * EMU, cy: SLIDE_H, fill: solidFill('1F4E79') }) +
            textBox({
              x: 0.8 * EMU,
              y: 0.8 * EMU,
              cx: 7 * EMU,
              cy: 1.2 * EMU,
              runs: [
                { text: '斜切装饰母版页 2/2', typeface: 'Noto Sans CJK SC', sz: 3200, b: true }
              ]
            }) +
            rect({
              x: 7.8 * EMU,
              y: 1.4 * EMU,
              cx: 2.4 * EMU,
              cy: 2.4 * EMU,
              fill: solidFill('ED7D31'),
              rot: 4500000,
              prst: 'diamond'
            })
        )
      }
    ]
  };
}

function caseSmartArt() {
  // 图形组合近似：层级树 + 循环图
  const box = (x, y, text, color) =>
    rect({ x, y, cx: 2.2 * EMU, cy: 1 * EMU, fill: solidFill(color), line: 'FFFFFF' }) +
    textBox({
      x,
      y: y + 0.22 * EMU,
      cx: 2.2 * EMU,
      cy: 0.6 * EMU,
      runs: [{ text, typeface: 'Noto Sans CJK SC', sz: 1400, b: true, color: 'FFFFFF' }],
      align: 'ctr'
    });
  const line = (x, y, w, h) => rect({ x, y, cx: w, cy: h, fill: solidFill('8497B0') });
  const hier =
    box(4.9 * EMU, 0.6 * EMU, '根节点', '1F4E79') +
    line(5.95 * EMU, 1.6 * EMU, 0.06 * EMU, 0.8 * EMU) +
    line(2.5 * EMU, 2.35 * EMU, 7.1 * EMU, 0.06 * EMU) +
    line(2.5 * EMU, 2.35 * EMU, 0.06 * EMU, 0.6 * EMU) +
    line(5.95 * EMU, 2.35 * EMU, 0.06 * EMU, 0.6 * EMU) +
    line(9.5 * EMU, 2.35 * EMU, 0.06 * EMU, 0.6 * EMU) +
    box(1.4 * EMU, 2.9 * EMU, '分支 A', '2E75B6') +
    box(4.9 * EMU, 2.9 * EMU, '分支 B', '2E75B6') +
    box(8.4 * EMU, 2.9 * EMU, '分支 C', '2E75B6');
  // 循环图：四个扇位近似（圆角矩形环绕 + 箭头弧用块近似）
  const cx = 6.1 * EMU;
  const cy = 3.4 * EMU;
  const cycle =
    box(cx - 1.1 * EMU, cy - 2.6 * EMU, '步骤 1', '4472C4') +
    box(cx + 1.6 * EMU, cy - 0.5 * EMU, '步骤 2', 'ED7D31') +
    box(cx - 1.1 * EMU, cy + 1.6 * EMU, '步骤 3', '70AD47') +
    box(cx - 3.8 * EMU, cy - 0.5 * EMU, '步骤 4', 'A5A5A5') +
    rect({
      x: cx - 0.35 * EMU,
      y: cy - 0.35 * EMU,
      cx: 0.7 * EMU,
      cy: 0.7 * EMU,
      fill: solidFill('1F4E79'),
      prst: 'ellipse'
    });
  return {
    id: 'smartart',
    file: 'smartart.pptx',
    expectedPages: 2,
    note: '层级图与循环图（图形组合近似 SmartArt 结构）',
    slides: [
      {
        xml: slideXml(
          textBox({
            x: 0.6 * EMU,
            y: 0.2 * EMU,
            cx: 6 * EMU,
            cy: 0.5 * EMU,
            runs: [{ text: '层级图（近似 SmartArt）', typeface: 'Noto Sans CJK SC', sz: 1600 }]
          }) + hier
        )
      },
      {
        xml: slideXml(
          textBox({
            x: 0.6 * EMU,
            y: 0.2 * EMU,
            cx: 6 * EMU,
            cy: 0.5 * EMU,
            runs: [{ text: '循环图（近似 SmartArt）', typeface: 'Noto Sans CJK SC', sz: 1600 }]
          }) + cycle
        )
      }
    ]
  };
}

function caseFormulaDense() {
  const formulas = [
    'E = mc^2',
    'a^2 + b^2 = c^2',
    '\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
    '\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}',
    '\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}',
    'F = G \\frac{m_1 m_2}{r^2}',
    '\\nabla \\cdot \\vec{E} = \\frac{\\rho}{\\varepsilon_0}',
    'i\\hbar \\frac{\\partial}{\\partial t}\\Psi = \\hat{H}\\Psi'
  ];
  return {
    id: 'formula-dense',
    file: 'formula-dense.pptx',
    expectedPages: 1,
    note: '多行 OMML 公式混排一页（线性文本形态，LO 数学排版压力）',
    slides: [
      {
        xml: slideXml(
          formulas
            .map((f, i) =>
              formulaBox({
                x: 0.8 * EMU,
                y: (0.4 + i * 0.75) * EMU,
                cx: 10.5 * EMU,
                cy: 0.7 * EMU,
                math: f
              })
            )
            .join(''),
          { mathNs: true }
        )
      }
    ]
  };
}

function caseChartEmbedded() {
  const bar = embeddedXlsx([
    ['组别', '销量'],
    ['一班', 42],
    ['二班', 35],
    ['三班', 48]
  ]);
  const line = embeddedXlsx([
    ['月份', '温度'],
    ['1月', 3],
    ['2月', 6],
    ['3月', 12]
  ]);
  return {
    id: 'chart-embedded',
    file: 'chart-embedded.pptx',
    expectedPages: 2,
    note: '嵌入 Excel 柱状图与折线图各一页（chart part + embedded xlsx）',
    slides: [
      {
        xml: slideXml(
          chartFrame({ x: 1 * EMU, y: 1 * EMU, cx: 10 * EMU, cy: 5 * EMU, rid: 'rId2' })
        ),
        chart: {
          name: 'chart1.xml',
          xlsxName: 'Microsoft_Excel_Worksheet1.xlsx',
          xml: chartXml({
            title: '柱状图样例',
            labels: ['一班', '二班', '三班'],
            values: [42, 35, 48],
            type: 'bar'
          }),
          xlsx: bar
        }
      },
      {
        xml: slideXml(
          chartFrame({ x: 1 * EMU, y: 1 * EMU, cx: 10 * EMU, cy: 5 * EMU, rid: 'rId2' })
        ),
        chart: {
          name: 'chart2.xml',
          xlsxName: 'Microsoft_Excel_Worksheet2.xlsx',
          xml: chartXml({
            title: '折线图样例',
            labels: ['1月', '2月', '3月'],
            values: [3, 6, 12],
            type: 'line'
          }),
          xlsx: line
        }
      }
    ]
  };
}

const CASE_BUILDERS = [
  caseFontMissing,
  caseFontInstalled,
  caseMasterComplex,
  caseSmartArt,
  caseFormulaDense,
  caseChartEmbedded
];

async function main() {
  mkdirSync(outDir, { recursive: true });
  const cases = [];
  for (const build of CASE_BUILDERS) {
    shapeId = 1;
    const c = build();
    const buf = await buildPptx(c.slides);
    writeFileSync(join(outDir, c.file), buf);
    cases.push({ id: c.id, file: c.file, expectedPages: c.expectedPages, note: c.note });
    console.log(`generated ${c.file} (${buf.length} bytes, ${c.expectedPages} pages)`);
  }
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ cases }, null, 2) + '\n');
  console.log(`manifest.json written → ${outDir}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
