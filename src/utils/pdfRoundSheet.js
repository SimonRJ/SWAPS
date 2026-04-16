import { jsPDF } from 'jspdf';
import { getFormationSlotXPercent, parseFormation } from './formations.js';

/* ─── Colour palette ─── */
const C = {
  GK:    { bg: [254, 249, 195], fg: [133,  77,  14] },
  DEF:   { bg: [219, 234, 254], fg: [ 30,  64, 175] },
  MID:   { bg: [243, 232, 255], fg: [107,  33, 168] },
  ATK:   { bg: [254, 226, 226], fg: [153,  27,  27] },
  BENCH: { bg: [243, 244, 246], fg: [ 75,  85,  99] },
  pitch600: [22, 163, 74],
  pitch700: [21, 128, 61],
  pitch100: [220, 252, 231],
  white: [255, 255, 255],
  gray50: [249, 250, 251],
  gray100: [243, 244, 246],
  gray200: [229, 231, 235],
  gray300: [209, 213, 219],
  gray400: [156, 163, 175],
  gray500: [107, 114, 128],
  gray600: [75, 85, 99],
  gray700: [55, 65, 81],
  gray800: [31, 41, 55],
  gray900: [17, 24, 39],
  red700: [185, 28, 28],
  emerald600: [5, 150, 105],
  emerald700: [4, 120, 87],
  slate800: [30, 41, 59],
  slate900: [15, 23, 42],
  navy: [30, 58, 95],
  gold: [200, 168, 78],
  jerseyRed: [204, 0, 0],
  jerseyBlack: [26, 26, 26],
};

const POS_COLORS = { GK: C.GK, DEF: C.DEF, MID: C.MID, ATK: C.ATK, BENCH: C.BENCH };

/**
 * Generate a professional single-page A4 PDF team sheet.
 *
 * Returns a Promise that resolves once the PDF has been saved.
 * The async behaviour is needed to pre-load team/opponent logo images
 * before embedding them into the document.
 *
 * Layout (top-to-bottom):
 *   1. Dark header banner with match info and team logos
 *   2. Two-column row: Pitch (left) | Bench + Substitutions (right column)
 *   3. Combined Game Minutes & Season Totals table (full width)
 *
 * All information fits on one portrait A4 page.
 */
/**
 * Attempt to load an image URL (regular or data-URL) into a data-URL
 * suitable for jsPDF's addImage.  Returns '' on failure.
 */
function loadImageAsDataUrl(src) {
  if (!src) return Promise.resolve('');
  // Already a data-URL – use directly
  if (src.startsWith('data:image/')) return Promise.resolve(src);
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve('');
      }
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}

export async function generateRoundPdf({
  roundNumber,
  roundInfo,
  teamName,
  teamLogoUrl,
  opponentLogoUrl,
  formationStr,
  gamePlan,
  subChanges,
  playerMinutes,
  activePlayers,
  cumulativeStats,
}) {
  // Pre-load logo images so they can be embedded in the PDF
  const [teamLogoDataUrl, opponentLogoDataUrl] = await Promise.all([
    loadImageAsDataUrl(teamLogoUrl),
    loadImageAsDataUrl(opponentLogoUrl),
  ]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();   // 210
  const pageH = doc.internal.pageSize.getHeight();   // 297
  const margin = 6;
  const contentW = pageW - margin * 2;
  let y = margin;

  const activePlayerById = new Map((activePlayers || []).map(player => [player.id, player]));
  const getPlayer = (id) => activePlayerById.get(id);

  /* ── helpers ── */
  function setFill(rgb) { doc.setFillColor(rgb[0], rgb[1], rgb[2]); }
  function setDraw(rgb) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]); }
  function setText(rgb) { doc.setTextColor(rgb[0], rgb[1], rgb[2]); }

  function cardBg(x, yPos, w, h, radius = 2.5) {
    setFill([230, 230, 230]);
    doc.roundedRect(x + 0.3, yPos + 0.3, w, h, radius, radius, 'F');
    setFill(C.white);
    setDraw(C.gray200);
    doc.setLineWidth(0.15);
    doc.roundedRect(x, yPos, w, h, radius, radius, 'FD');
  }

  // Spacing between adjacent position pills in millimeters.
  const PILL_SPACING = 0.7;

  function withBoldFont(fontSize, fn) {
    const prevFontSize = doc.getFontSize();
    const prevFont = doc.getFont();
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', 'bold');
    const result = fn();
    doc.setFont(prevFont.fontName, prevFont.fontStyle);
    doc.setFontSize(prevFontSize);
    return result;
  }

  function getPillMetrics(label, fontSize = 6) {
    return withBoldFont(fontSize, () => {
      const tw = doc.getTextWidth(label);
      const pw = tw + 3;
      const ph = fontSize * 0.45 + 1.8;
      return { pw, ph };
    });
  }

  function pill(x, yPos, label, bgRgb, fgRgb, fontSize = 6) {
    const { pw, ph } = getPillMetrics(label, fontSize);
    setFill(bgRgb);
    doc.roundedRect(x, yPos, pw, ph, ph / 2, ph / 2, 'F');
    setText(fgRgb);
    withBoldFont(fontSize, () => {
      doc.text(label, x + pw / 2, yPos + ph * 0.72, { align: 'center' });
    });
    return pw;
  }

  function pillWidth(label, fontSize = 6) {
    const { pw } = getPillMetrics(label, fontSize);
    return pw;
  }

  function playerLabel(p) {
    return p?.shirtNumber || p?.name?.charAt(0)?.toUpperCase() || '?';
  }

  /** Get up to 2 initials from a name string (e.g. "Foo Bar" → "FB"). */
  function getInitials(name) {
    return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
  }

  /** Draw a red MUMFC jersey at (cx, cy) with given width & height.
   *  Renders the uploaded club logo on the chest if available,
   *  otherwise falls back to a navy circle with "FC". */
  function drawJersey(cx, cy, w, h, number) {
    const sx = w / 100;
    const sy = h / 120;
    const x0 = cx - w / 2;
    const y0 = cy - h * 0.4;

    // Main body (red)
    setFill(C.jerseyRed);
    doc.lines(
      [[20*sx,0],[7*sx,13*sy],[18*sx,0],[7*sx,-13*sy],[20*sx,0],
       [14*sx,28*sy],[-12*sx,18*sy],[0,74*sy],[-76*sx,0],[0,-74*sy],[-12*sx,-18*sy]],
      x0 + 14*sx, y0, [1, 1], 'F', true,
    );
    // Left sleeve (black, longer)
    setFill(C.jerseyBlack);
    doc.lines(
      [[-20*sx,40*sy],[18*sx,24*sy],[0,-64*sy]],
      x0 + 14*sx, y0, [1, 1], 'F', true,
    );
    // Right sleeve (black, longer)
    doc.lines(
      [[20*sx,40*sy],[-18*sx,24*sy],[0,-64*sy]],
      x0 + 86*sx, y0, [1, 1], 'F', true,
    );
    // V-neck collar
    setFill(C.jerseyBlack);
    doc.lines(
      [[3*sx,-9*sy],[12*sx,0],[3*sx,9*sy]],
      x0 + 41*sx, y0 + 13*sy, [1, 1], 'F', true,
    );

    // Club crest – use uploaded logo when available
    const crestR = Math.max(1, 4 * sx);
    const crestCx = x0 + 34 * sx;
    const crestCy = y0 + 40 * sy;
    let crestDrawn = false;
    if (teamLogoDataUrl) {
      try {
        const crestSize = crestR * 2;
        doc.addImage(teamLogoDataUrl, 'PNG', crestCx - crestR, crestCy - crestR, crestSize, crestSize);
        crestDrawn = true;
      } catch { /* fall through to text fallback */ }
    }
    if (!crestDrawn) {
      setFill(C.navy);
      doc.circle(crestCx, crestCy, crestR, 'F');
      setDraw(C.gold);
      doc.setLineWidth(0.2);
      doc.circle(crestCx, crestCy, crestR, 'S');
      doc.setFontSize(Math.max(2.5, crestR * 1.4));
      doc.setFont('helvetica', 'bold');
      setText(C.gold);
      doc.text('FC', crestCx, crestCy + crestR * 0.35, { align: 'center' });
    }

    doc.setFontSize(Math.max(9, h * 0.5));
    doc.setFont('helvetica', 'bold');
    setText(C.white);
    doc.text(String(number), cx, cy + h * 0.18, { align: 'center' });
  }

  /** Draw a bench jersey (grey tones, longer sleeves). */
  function drawBenchJersey(cx, cy, w, h, number) {
    const sx = w / 100;
    const sy = h / 120;
    const x0 = cx - w / 2;
    const y0 = cy - h * 0.4;

    // Main body
    setFill(C.gray400);
    doc.lines(
      [[20*sx,0],[7*sx,13*sy],[18*sx,0],[7*sx,-13*sy],[20*sx,0],
       [14*sx,28*sy],[-12*sx,18*sy],[0,74*sy],[-76*sx,0],[0,-74*sy],[-12*sx,-18*sy]],
      x0 + 14*sx, y0, [1, 1], 'F', true,
    );
    // Left sleeve (darker, longer)
    setFill(C.gray600);
    doc.lines(
      [[-20*sx,40*sy],[18*sx,24*sy],[0,-64*sy]],
      x0 + 14*sx, y0, [1, 1], 'F', true,
    );
    // Right sleeve (darker, longer)
    doc.lines(
      [[20*sx,40*sy],[-18*sx,24*sy],[0,-64*sy]],
      x0 + 86*sx, y0, [1, 1], 'F', true,
    );
    // Collar
    setFill(C.gray600);
    doc.lines(
      [[3*sx,-9*sy],[12*sx,0],[3*sx,9*sy]],
      x0 + 41*sx, y0 + 13*sy, [1, 1], 'F', true,
    );

    doc.setFontSize(Math.max(7, h * 0.55));
    doc.setFont('helvetica', 'bold');
    setText(C.white);
    doc.text(String(number), cx, cy + h * 0.18, { align: 'center' });
  }

  function drawArrowDown(cx, cy, size, color) {
    setFill(color);
    setDraw(color);
    doc.setLineWidth(0.3);
    doc.line(cx, cy - size, cx, cy + size * 0.3);
    doc.triangle(
      cx - size * 0.5, cy + size * 0.1,
      cx + size * 0.5, cy + size * 0.1,
      cx, cy + size, 'F',
    );
  }

  function drawArrowUp(cx, cy, size, color) {
    setFill(color);
    setDraw(color);
    doc.setLineWidth(0.3);
    doc.line(cx, cy + size, cx, cy - size * 0.3);
    doc.triangle(
      cx - size * 0.5, cy - size * 0.1,
      cx + size * 0.5, cy - size * 0.1,
      cx, cy - size, 'F',
    );
  }

  /* ===================================================================
   * SECTION 1 – Header Banner
   * =================================================================== */
  {
    const bannerH = 32;
    setFill(C.slate900);
    doc.roundedRect(margin, y, contentW, bannerH, 3, 3, 'F');
    // Red accent strip
    setFill(C.jerseyRed);
    doc.rect(margin, y + bannerH - 2.5, contentW, 2.5, 'F');
    setFill(C.slate900);
    doc.roundedRect(margin, y, contentW, bannerH - 2.5, 3, 3, 'F');
    doc.rect(margin, y + 3, contentW, bannerH - 5.5, 'F');

    // Title line
    const cx = margin + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    setText(C.white);
    doc.text(`Round ${roundNumber} Team Sheet`, cx, y + 9);

    // Team vs Opponent line with logos and bigger font
    const teamDisplayName = teamName || 'Team';
    const opponent = roundInfo?.opponentName || 'Opponent TBC';

    const logoY = y + 21;
    const logoR = 5;
    const logoDiam = logoR * 2;
    let lx = cx;

    /** Draw a logo image inside a circle or fall back to initials. */
    function drawLogoOrInitials(x, yPos, radius, dataUrl, name, fillBg, fillFg, strokeColor) {
      if (dataUrl) {
        try {
          doc.addImage(dataUrl, 'PNG', x, yPos - radius, radius * 2, radius * 2);
          return;
        } catch { /* fall through to initials */ }
      }
      setFill(fillBg);
      doc.circle(x + radius, yPos, radius, 'F');
      setDraw(strokeColor);
      doc.setLineWidth(0.3);
      doc.circle(x + radius, yPos, radius, 'S');
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      setText(fillFg);
      doc.text(getInitials(name), x + radius, yPos + 1.8, { align: 'center' });
    }

    // Team logo
    drawLogoOrInitials(lx, logoY, logoR, teamLogoDataUrl, teamDisplayName, C.navy, C.gold, C.gold);

    lx += logoDiam + 2.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setText(C.white);
    doc.text(teamDisplayName, lx, logoY + 2);
    lx += doc.getTextWidth(teamDisplayName) + 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    setText([180, 190, 210]);
    doc.text('vs', lx, logoY + 2);
    lx += doc.getTextWidth('vs') + 5;

    // Opponent logo
    drawLogoOrInitials(lx, logoY, logoR, opponentLogoDataUrl, opponent, C.gray600, C.white, C.gray400);

    lx += logoDiam + 2.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    setText(C.white);
    doc.text(opponent, lx, logoY + 2);

    // Game date + home/away metadata in top-right of the banner
    const dateStr = roundInfo?.date || 'Date TBC';
    const homeAway = roundInfo?.homeAway === 'AWAY' ? 'AWAY' : 'HOME';
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setText(C.white);
    doc.text(dateStr, margin + contentW - 4, y + 10, { align: 'right' });
    doc.setFontSize(9);
    setText([190, 200, 220]);
    doc.text(homeAway, margin + contentW - 4, y + 16, { align: 'right' });

    y += bannerH + 2;
  }

  /* ── Early exit if no plan ── */
  if (!gamePlan || gamePlan.length === 0) {
    cardBg(margin, y, contentW, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    setText(C.gray400);
    doc.text('No team sheet available — not enough active players.', margin + 6, y + 8);
    doc.save(`Round_${roundNumber}_TeamSheet.pdf`);
    return;
  }

  /* ===================================================================
   * SECTION 2 – Pitch (left) + Bench & Substitutions (right column)
   * =================================================================== */
  {
    const startingField = gamePlan[0].onField;
    const bench = gamePlan[0].onBench;

    const fieldW = 112;
    const fieldX = margin;
    const fieldY = y;

    // --- Pre-calculate right column height so the field can match ---
    const rightX = fieldX + fieldW + 2.5;
    const rightW = contentW - fieldW - 2.5;

    let rightTotalH = 0;

    // Bench card height (horizontal layout)
    let benchCardH = 0;
    if (bench.length > 0) {
      const benchHeaderH = 8;
      const benchBodyH = 16;
      benchCardH = benchHeaderH + benchBodyH + 3;
      rightTotalH += benchCardH + 2;
    }

    // Substitutions card height
    let subCardH = 0;
    if (subChanges.length > 0) {
      const subRowH = 6.5;
      let totalSubRows = 0;
      for (const { subs } of subChanges) totalSubRows += subs.length;
      const subHeaderH = 8;
      const blockHeaderH = 6;
      subCardH = subHeaderH + subChanges.length * blockHeaderH + totalSubRows * subRowH + 3;
      rightTotalH += subCardH;
    }

    // Field height = max of the right column or a minimum of 90
    // Field height matches the right column; minimum 90mm to keep proper pitch proportions
    const fieldH = Math.max(90, rightTotalH);

    // --- LEFT: Pitch ---
    // Pitch background
    setFill(C.pitch600);
    doc.roundedRect(fieldX, fieldY, fieldW, fieldH, 3, 3, 'F');
    setFill(C.pitch700);
    doc.rect(fieldX, fieldY + fieldH * 0.42, fieldW, fieldH * 0.16, 'F');

    // Pitch markings
    setDraw([255, 255, 255]);
    doc.setLineWidth(0.25);
    doc.line(fieldX + 2.5, fieldY + fieldH / 2, fieldX + fieldW - 2.5, fieldY + fieldH / 2);
    const ccR = 9;
    doc.circle(fieldX + fieldW / 2, fieldY + fieldH / 2, ccR, 'S');
    setFill([255, 255, 255]);
    doc.circle(fieldX + fieldW / 2, fieldY + fieldH / 2, 0.5, 'F');
    setDraw([255, 255, 255]);
    const paW = 32;
    const paH = 12;
    doc.rect(fieldX + (fieldW - paW) / 2, fieldY + 1.5, paW, paH, 'S');
    doc.rect(fieldX + (fieldW - paW) / 2, fieldY + fieldH - paH - 1.5, paW, paH, 'S');
    const gaW = 16;
    const gaH = 4.5;
    doc.rect(fieldX + (fieldW - gaW) / 2, fieldY + 1.5, gaW, gaH, 'S');
    doc.rect(fieldX + (fieldW - gaW) / 2, fieldY + fieldH - gaH - 1.5, gaW, gaH, 'S');
    // Corner arcs
    doc.setLineWidth(0.2);
    const cornerR = 2.5;
    const arcSegs = 6;
    function drawCornerArc(ox, oy, startAngle) {
      const step = (Math.PI / 2) / arcSegs;
      const pts = [];
      for (let i = 0; i <= arcSegs; i++) {
        const a = startAngle + step * i;
        pts.push([ox + Math.cos(a) * cornerR, oy + Math.sin(a) * cornerR]);
      }
      for (let i = 0; i < pts.length - 1; i++) {
        doc.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      }
    }
    drawCornerArc(fieldX + 1.5, fieldY + 1.5, 0);
    drawCornerArc(fieldX + fieldW - 1.5, fieldY + 1.5, Math.PI / 2);
    drawCornerArc(fieldX + fieldW - 1.5, fieldY + fieldH - 1.5, Math.PI);
    drawCornerArc(fieldX + 1.5, fieldY + fieldH - 1.5, Math.PI * 1.5);

    // Players on pitch (bigger jerseys & names)
    const formArr = parseFormation(formationStr);
    const posCounts = { GK: 1, DEF: formArr[0], MID: formArr[1], ATK: formArr[2] };
    const posIndex = { GK: 0, DEF: 0, MID: 0, ATK: 0 };
    const pitchYPercents = { GK: 88, DEF: 68, MID: 46, ATK: 22 };
    const jerseyW = 12;
    const jerseyH = 14;

    for (const { playerId, position } of startingField) {
      const p = getPlayer(playerId);
      const idx = posIndex[position] || 0;
      posIndex[position] = idx + 1;
      const count = posCounts[position] || 1;

      const xPct = count === 1 ? 50 : getFormationSlotXPercent(position, idx, count);
      const yPct = pitchYPercents[position] || 50;
      const px = fieldX + (xPct / 100) * fieldW;
      const py = fieldY + (yPct / 100) * fieldH;

      drawJersey(px, py, jerseyW, jerseyH, playerLabel(p));

      const name = p?.name || '?';
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      const nameW = doc.getTextWidth(name) + 2.5;
      setFill([0, 0, 0]);
      doc.roundedRect(px - nameW / 2, py + jerseyH * 0.42, nameW, 5, 1, 1, 'F');
      setText(C.white);
      doc.text(name, px, py + jerseyH * 0.42 + 3.6, { align: 'center' });
    }

    // --- RIGHT COLUMN: Bench + Substitutions ---
    let ry = fieldY;

    // Bench card (horizontal layout)
    if (bench.length > 0) {
      const benchHeaderH = 8;
      cardBg(rightX, ry, rightW, benchCardH, 2.5);

      // Bench header
      setFill(C.slate900);
      doc.roundedRect(rightX, ry, rightW, benchHeaderH, 2.5, 2.5, 'F');
      doc.rect(rightX, ry + 2.5, rightW, benchHeaderH - 2.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      setText(C.white);
      doc.text('BENCH', rightX + rightW / 2, ry + 5.5, { align: 'center' });

      // Horizontal bench players
      const benchBodyY = ry + benchHeaderH + 2;
      const benchCount = bench.length;
      const spacing = rightW / (benchCount + 1);

      for (let i = 0; i < benchCount; i++) {
        const id = bench[i];
        const p = getPlayer(id);
        const bx = rightX + spacing * (i + 1);
        const by = benchBodyY + 3;

        drawBenchJersey(bx, by, 6, 7, playerLabel(p));

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        setText(C.gray900);
        const pName = p?.name || '?';
        doc.text(pName, bx, by + 7, { align: 'center' });
      }

      ry += benchCardH + 2;
    }

    // Substitutions card (in the right column)
    if (subChanges.length > 0) {
      const subRowH = 6.5;
      const subHeaderH = 8;
      const blockHeaderH = 6;

      cardBg(rightX, ry, rightW, subCardH, 2.5);

      // Section header
      setFill(C.slate900);
      doc.roundedRect(rightX, ry, rightW, subHeaderH, 2.5, 2.5, 'F');
      doc.rect(rightX, ry + 2.5, rightW, subHeaderH - 2.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      setText(C.white);
      doc.text('SUBSTITUTIONS', rightX + rightW / 2, ry + 5.5, { align: 'center' });

      let sy = ry + subHeaderH + 2;

      let blockNum = 0;
      for (const { minute, subs } of subChanges) {
        blockNum++;
        // Block sub-header
        setFill(C.gray100);
        doc.roundedRect(rightX + 1.5, sy - 1, rightW - 3, blockHeaderH, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        setText(C.slate800);
        doc.text(`Block ${blockNum} \u2014 ${minute}'`, rightX + rightW / 2, sy + 2.5, { align: 'center' });
        sy += blockHeaderH + 1;

        for (const sub of subs) {
          const offP = getPlayer(sub.off);
          const onP = getPlayer(sub.on);
          const posC = POS_COLORS[sub.position] || C.BENCH;
          let sx = rightX + 2.5;

          // Off arrow + name
          drawArrowDown(sx + 1, sy, 1.4, C.red700);
          sx += 4;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          setText(C.gray600);
          const offName = offP?.name || '?';
          doc.text(offName, sx, sy + 0.5);

          // On arrow + name
          sx = rightX + rightW / 2 - 1;
          drawArrowUp(sx + 1, sy, 1.4, C.emerald600);
          sx += 4;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          setText(C.gray900);
          const onName = onP?.name || '?';
          doc.text(onName, sx, sy + 0.5);

          // Position pill (right-aligned)
          const pillX = rightX + rightW - 12;
          pill(pillX, sy - 1.8, sub.position, posC.bg, posC.fg, 5.5);

          sy += subRowH;
        }
      }
      ry = sy + 1;
    }

    y = Math.max(fieldY + fieldH, ry) + 2.5;
  }

  /* ===================================================================
   * SECTION 3 – Player Minutes (Game + Season)
   * =================================================================== */
  {
    const mergedPlayerMap = new Map((activePlayers || []).map(player => [player.id, player]));
    for (const playerId of Object.keys(playerMinutes || {})) {
      if (!mergedPlayerMap.has(playerId) && playerId) {
        mergedPlayerMap.set(playerId, { id: playerId, name: 'Unknown Player' });
      }
    }
    for (const playerId of Object.keys(cumulativeStats || {})) {
      if (!mergedPlayerMap.has(playerId) && playerId) {
        mergedPlayerMap.set(playerId, { id: playerId, name: 'Unknown Player' });
      }
    }

    const mergedPlayers = Array.from(mergedPlayerMap.values()).sort((a, b) => {
      const gameA = playerMinutes[a.id]?.field || 0;
      const gameB = playerMinutes[b.id]?.field || 0;
      if (gameB !== gameA) return gameB - gameA;
      const seasonA = (cumulativeStats[a.id]?.minutesGK || 0) + (cumulativeStats[a.id]?.minutesDEF || 0)
        + (cumulativeStats[a.id]?.minutesMID || 0) + (cumulativeStats[a.id]?.minutesATK || 0);
      const seasonB = (cumulativeStats[b.id]?.minutesGK || 0) + (cumulativeStats[b.id]?.minutesDEF || 0)
        + (cumulativeStats[b.id]?.minutesMID || 0) + (cumulativeStats[b.id]?.minutesATK || 0);
      return seasonB - seasonA;
    });

    const rowH = 5;
    const headerH = 8;
    const tableHeaderH = 4.5;
    const tableLeft = margin + 3;
    const tableW = contentW - 6;
    const tableCols = ['name', 'pos', 'gameField', 'gameBench', 'gk', 'def', 'mid', 'atk', 'seasonPlayed', 'seasonBench'];
    const colW = tableW / tableCols.length;
    const colX = tableCols.reduce((acc, key, idx) => {
      acc[key] = tableLeft + colW * idx + colW / 2;
      return acc;
    }, {});
    const gkW = pillWidth('GK', 5.3);
    const defW = pillWidth('DEF', 5.3);
    const midW = pillWidth('MID', 5.3);
    const atkW = pillWidth('ATK', 5.3);
    const fixedTableHeight = headerH + 2 + tableHeaderH + 2;

    const renderTablePage = (playersForPage, startY, pageIndex, rowStartIndex) => {
      const cardH = headerH + 2 + tableHeaderH + playersForPage.length * rowH + 2;
      cardBg(margin, startY, contentW, cardH, 2.5);

      setFill(C.slate900);
      doc.roundedRect(margin, startY, contentW, headerH, 2.5, 2.5, 'F');
      doc.rect(margin, startY + 2.5, contentW, headerH - 2.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      setText(C.white);
      doc.text(
        pageIndex === 0 ? 'PLAYER MINUTES' : 'PLAYER MINUTES (CONT.)',
        margin + contentW / 2,
        startY + 5.5,
        { align: 'center' },
      );

      let ty = startY + headerH + 4;
      doc.setFontSize(6.2);
      doc.setFont('helvetica', 'bold');
      setText(C.gray400);
      doc.text('PLAYER', colX.name, ty, { align: 'center' });
      doc.text('POSITIONS', colX.pos, ty, { align: 'center' });
      doc.text('FIELD', colX.gameField, ty, { align: 'center' });
      doc.text('BENCH', colX.gameBench, ty, { align: 'center' });
      pill(colX.gk - gkW / 2, ty - 2.2, 'GK', C.GK.bg, C.GK.fg, 5.3);
      pill(colX.def - defW / 2, ty - 2.2, 'DEF', C.DEF.bg, C.DEF.fg, 5.3);
      pill(colX.mid - midW / 2, ty - 2.2, 'MID', C.MID.bg, C.MID.fg, 5.3);
      pill(colX.atk - atkW / 2, ty - 2.2, 'ATK', C.ATK.bg, C.ATK.fg, 5.3);
      setText(C.gray400);
      doc.text('PLAYED', colX.seasonPlayed, ty, { align: 'center' });
      doc.text('BENCH', colX.seasonBench, ty, { align: 'center' });
      setFill(C.gray200);
      doc.rect(tableLeft, ty + 1, tableW, 0.2, 'F');
      ty += tableHeaderH;

      playersForPage.forEach((p, idx) => {
        const rowNumber = rowStartIndex + idx;
        const mins = playerMinutes[p.id] || {};
        const cum = cumulativeStats[p.id] || {};
        const gk = cum.minutesGK || 0;
        const def = cum.minutesDEF || 0;
        const mid = cum.minutesMID || 0;
        const atk = cum.minutesATK || 0;
        const totalSeason = gk + def + mid + atk;

        if (rowNumber % 2 === 0) {
          setFill(C.gray50);
          doc.rect(tableLeft, ty - 2.8, tableW, rowH, 'F');
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        setText(C.gray900);
        doc.text(p.name || 'Unknown Player', colX.name, ty, { align: 'center' });

        const posEntries = Object.entries(mins.positions || {}).filter(([, v]) => v > 0);
        if (posEntries.length > 0) {
          const posPills = posEntries.map(([pos, min]) => {
            const posC = POS_COLORS[pos] || C.BENCH;
            const label = `${pos} ${min}'`;
            const pw = pillWidth(label, 5.5);
            return { posC, label, pw };
          });
          const totalPosW = posPills.reduce((sum, item) => sum + item.pw, 0) + (posPills.length - 1) * PILL_SPACING;
          let px = colX.pos - totalPosW / 2;
          for (const item of posPills) {
            pill(px, ty - 2.2, item.label, item.posC.bg, item.posC.fg, 5.5);
            px += item.pw + PILL_SPACING;
          }
        } else {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7);
          setText(C.gray400);
          doc.text('—', colX.pos, ty, { align: 'center' });
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        setText(C.pitch700);
        doc.text(`${mins.field || 0}'`, colX.gameField, ty, { align: 'center' });
        doc.text(`${mins.bench || 0}'`, colX.gameBench, ty, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        setText(C.gray700);
        doc.text(`${gk}'`, colX.gk, ty, { align: 'center' });
        doc.text(`${def}'`, colX.def, ty, { align: 'center' });
        doc.text(`${mid}'`, colX.mid, ty, { align: 'center' });
        doc.text(`${atk}'`, colX.atk, ty, { align: 'center' });
        doc.setFont('helvetica', 'bold');
        setText(C.pitch700);
        doc.text(`${totalSeason}'`, colX.seasonPlayed, ty, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        setText(C.gray700);
        doc.text(`${cum.minutesBench || 0}'`, colX.seasonBench, ty, { align: 'center' });
        ty += rowH;
      });
    };

    let rowStartIndex = 0;
    let pageIndex = 0;
    while (rowStartIndex < mergedPlayers.length) {
      const startY = pageIndex === 0 ? y : margin;
      const availableH = pageH - startY - margin;
      const rowsPerPage = Math.max(1, Math.floor((availableH - fixedTableHeight) / rowH));
      const playersForPage = mergedPlayers.slice(rowStartIndex, rowStartIndex + rowsPerPage);
      renderTablePage(playersForPage, startY, pageIndex, rowStartIndex);
      rowStartIndex += playersForPage.length;
      if (rowStartIndex < mergedPlayers.length) {
        doc.addPage();
        pageIndex += 1;
      }
    }
  }

  /* ── Save ── */
  doc.save(`Round_${roundNumber}_TeamSheet.pdf`);
}
