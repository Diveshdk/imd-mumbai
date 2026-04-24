/**
 * mapExportUtils.ts
 *
 * Proper Leaflet map export that bypasses html2canvas entirely.
 * Strategy: Find the Leaflet SVG layer inside a container, clone it,
 * resolve all CSS-transform offsets, and draw it to a canvas via XMLSerializer + Image.
 *
 * This gives a pixel-perfect, full-map export regardless of pan/zoom state.
 */

export async function exportLeafletMapToCanvas(
  containerEl: HTMLElement,
  opts: {
    backgroundColor?: string;
    scale?: number;
    padding?: number;
  } = {}
): Promise<HTMLCanvasElement | null> {
  const { backgroundColor = '#f0f9ff', scale = 2, padding = 20 } = opts;

  // 1. Find the Leaflet map pane and its SVG overlay
  const mapPane = containerEl.querySelector('.leaflet-map-pane') as HTMLElement | null;
  const svgOverlay = containerEl.querySelector('.leaflet-overlay-pane svg') as SVGSVGElement | null;
  const markerPane = containerEl.querySelector('.leaflet-marker-pane') as HTMLElement | null;

  if (!svgOverlay) {
    console.error('[mapExport] Could not find leaflet SVG overlay.');
    return null;
  }

  // 2. Get the container's bounding box — this is what we want to export
  const containerRect = containerEl.getBoundingClientRect();
  const W = containerRect.width;
  const H = containerRect.height;

  // 3. Clone the full SVG and resolve the CSS 3D-transform offset that Leaflet uses
  //    Leaflet sets: transform: translate3d(Xpx, Ypx, 0) on .leaflet-map-pane
  //    The SVG inside overlay-pane has its own transform too.
  const mapPaneTransform = mapPane ? getTranslate(mapPane) : { x: 0, y: 0 };
  const svgTransform = getTranslate(svgOverlay.parentElement as HTMLElement);

  // Total offset of SVG coordinate space relative to container top-left
  const offsetX = mapPaneTransform.x + svgTransform.x;
  const offsetY = mapPaneTransform.y + svgTransform.y;

  // 4. Clone SVG, fix its viewBox to match the full container
  const svgClone = svgOverlay.cloneNode(true) as SVGSVGElement;

  // Remove all transforms — we'll bake the offset into viewBox instead
  svgClone.style.transform = 'none';
  svgClone.removeAttribute('transform');

  // Walk all child groups and strip transforms (Leaflet puts transform on paths group)
  svgClone.querySelectorAll('[transform]').forEach(el => el.removeAttribute('transform'));
  svgClone.querySelectorAll('g').forEach((g) => {
    g.style.transform = 'none';
  });

  // Set the viewBox so that the GeoJSON paths match the container
  // The SVG internal coordinate system starts at (-offsetX, -offsetY) relative to container
  const originalW = parseFloat(svgOverlay.getAttribute('width') || String(W));
  const originalH = parseFloat(svgOverlay.getAttribute('height') || String(H));

  svgClone.setAttribute('width', String(W));
  svgClone.setAttribute('height', String(H));
  svgClone.setAttribute('viewBox', `${-offsetX} ${-offsetY} ${originalW} ${originalH}`);
  svgClone.style.width = `${W}px`;
  svgClone.style.height = `${H}px`;

  // 5. Also capture marker/label divs (the district value labels)
  //    We convert them to SVG <text> elements placed at the correct position
  const labelElements: Array<{ x: number; y: number; text: string }> = [];
  if (markerPane) {
    markerPane.querySelectorAll('.leaflet-marker-icon').forEach((marker) => {
      const el = marker as HTMLElement;
      // Leaflet positions markers with transform: translate3d(x, y, 0)
      const pos = getTranslate(el);
      // Adjust for map pane and marker pane transforms
      const markerPaneTransform = getTranslate(markerPane);
      const absX = mapPaneTransform.x + markerPaneTransform.x + pos.x;
      const absY = mapPaneTransform.y + markerPaneTransform.y + pos.y;
      // The inner div contains the text
      const innerDiv = el.querySelector('div');
      const text = innerDiv?.textContent?.trim() || '';
      if (text) {
        // Markers are centered via translateX(-25px) in their style; add 25 to fix center
        labelElements.push({ x: absX + 25, y: absY + 8, text });
      }
    });
  }

  // Add labels as SVG text elements
  if (labelElements.length > 0) {
    labelElements.forEach(({ x, y, text }) => {
      const textEl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      textEl.setAttribute('x', String(x - offsetX));
      textEl.setAttribute('y', String(y - offsetY));
      textEl.setAttribute('text-anchor', 'middle');
      textEl.setAttribute('dominant-baseline', 'middle');
      textEl.setAttribute('font-size', '9');
      textEl.setAttribute('font-weight', '800');
      textEl.setAttribute('fill', '#111');
      textEl.setAttribute('stroke', '#fff');
      textEl.setAttribute('stroke-width', '2');
      textEl.setAttribute('paint-order', 'stroke');
      textEl.setAttribute('font-family', 'system-ui, sans-serif');
      textEl.textContent = text;
      svgClone.appendChild(textEl);
    });
  }

  // 6. Serialize SVG to a data URL
  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(svgClone);
  const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  // 7. Draw onto canvas
  const canvas = document.createElement('canvas');
  canvas.width = (W + padding * 2) * scale;
  canvas.height = (H + padding * 2) * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);

  // Background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, W + padding * 2, H + padding * 2);

  // Draw the SVG
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, padding, padding, W, H);
      URL.revokeObjectURL(svgUrl);
      resolve();
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error('Failed to load SVG image'));
    };
    img.src = svgUrl;
  });

  return canvas;
}

/** Parse CSS transform translate3d or translate values */
function getTranslate(el: HTMLElement | null): { x: number; y: number } {
  if (!el) return { x: 0, y: 0 };
  const style = el.style.transform || window.getComputedStyle(el).transform;
  if (!style || style === 'none') return { x: 0, y: 0 };

  // translate3d(x, y, z)
  const m3d = style.match(/translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/);
  if (m3d) return { x: parseFloat(m3d[1]), y: parseFloat(m3d[2]) };

  // translate(x, y)
  const m2d = style.match(/translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/);
  if (m2d) return { x: parseFloat(m2d[1]), y: parseFloat(m2d[2]) };

  // matrix(a, b, c, d, tx, ty)
  const mmat = style.match(/matrix\([^)]+,\s*(-?[\d.]+),\s*(-?[\d.]+)\)/);
  if (mmat) return { x: parseFloat(mmat[1]), y: parseFloat(mmat[2]) };

  return { x: 0, y: 0 };
}

/**
 * High-level function: export a single Leaflet map container to PNG download.
 */
export async function downloadLeafletMap(
  containerId: string,
  fileName: string,
  opts: {
    title?: string;
    subtitle?: string;
    scale?: number;
  } = {}
): Promise<void> {
  const el = document.getElementById(containerId);
  if (!el) throw new Error(`Container not found: ${containerId}`);

  const { title, subtitle, scale = 2 } = opts;

  // Wait a tick for Leaflet to settle
  await new Promise(r => setTimeout(r, 300));

  const mapCanvas = await exportLeafletMapToCanvas(el, { scale, padding: 0 });
  if (!mapCanvas) throw new Error('Failed to export map');

  // If title/subtitle, composite onto a larger canvas with header
  let finalCanvas = mapCanvas;

  if (title || subtitle) {
    const headerH = title && subtitle ? 60 : 36;
    const footerH = 28;
    const fc = document.createElement('canvas');
    fc.width = mapCanvas.width;
    fc.height = mapCanvas.height + (headerH + footerH) * scale;
    const ctx = fc.getContext('2d')!;

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, fc.width, fc.height);

    // Header
    if (title) {
      ctx.fillStyle = '#111827';
      ctx.font = `bold ${14 * scale}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(title, fc.width / 2, 22 * scale);
    }
    if (subtitle) {
      ctx.fillStyle = '#6b7280';
      ctx.font = `${10 * scale}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(subtitle, fc.width / 2, (title ? 38 : 20) * scale);
    }

    // Map
    ctx.drawImage(mapCanvas, 0, headerH * scale);

    // Footer
    ctx.fillStyle = '#9ca3af';
    ctx.font = `${8 * scale}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(
      `Maharashtra Weather Verification System · ${new Date().toLocaleString('en-IN')}`,
      fc.width / 2,
      mapCanvas.height + (headerH + 18) * scale
    );

    finalCanvas = fc;
  }

  await triggerDownload(finalCanvas, fileName);
}

/**
 * Export the research panel (5 maps) to a single stacked PNG.
 * Each map is in a separate container; we export each and composite them.
 */
export async function downloadResearchPanel(
  panelContainerEl: HTMLElement,
  fileName: string,
  opts: {
    headerText?: string;
    subText?: string;
    scale?: number;
  } = {}
): Promise<void> {
  const { scale = 2 } = opts;

  // Wait for maps to settle
  await new Promise(r => setTimeout(r, 400));

  // Find all individual map containers inside the panel
  // They are identified by having .leaflet-container inside them
  const mapContainers = Array.from(
    panelContainerEl.querySelectorAll<HTMLElement>('.leaflet-container')
  ).map(lc => {
    // Walk up to find the styled wrapper div
    let el = lc.parentElement;
    while (el && el !== panelContainerEl) {
      if (el.style.height || el.style.position === 'relative') return el;
      el = el.parentElement;
    }
    return lc.parentElement || lc;
  });

  if (mapContainers.length === 0) {
    throw new Error('No map containers found in panel');
  }

  // Export each map
  const mapCanvases: HTMLCanvasElement[] = [];
  for (const mc of mapContainers) {
    const c = await exportLeafletMapToCanvas(mc, { scale, padding: 0, backgroundColor: '#f0f9ff' });
    if (c) mapCanvases.push(c);
  }

  if (mapCanvases.length === 0) throw new Error('No maps exported');

  // Get the full panel HTML (titles, headers, footer) rendered via html2canvas fallback
  // But only the non-map parts — we'll composite manually
  const html2canvas = (await import('html2canvas')).default;
  
  const fullPanelCanvas = await html2canvas(panelContainerEl, {
    backgroundColor: '#ffffff',
    scale,
    useCORS: true,
    logging: false,
    onclone: (clonedDoc: Document) => {
      // 1. Inject a style override to suppress modern CSS color functions
      //    html2canvas cannot parse lab(), oklch(), lch(), color() etc.
      const styleOverride = clonedDoc.createElement('style');
      styleOverride.textContent = `
        * {
          transition: none !important;
          animation: none !important;
          text-shadow: none !important;
        }
        /* Nuke any CSS custom property that might resolve to a modern color */
        :root {
          --tw-shadow-color: rgba(0,0,0,0.1) !important;
          --tw-ring-color: rgba(59,130,246,0.5) !important;
        }
      `;
      clonedDoc.head.appendChild(styleOverride);

      // 2. Hide Leaflet containers (maps are composited separately via SVG export)
      Array.from(clonedDoc.querySelectorAll('.leaflet-container')).forEach((el) => {
        (el as HTMLElement).style.cssText += '; visibility: hidden !important;';
      });

      // 3. Walk every element and sanitize computed color values that html2canvas can't handle
      //    Pattern: lab(...), oklch(...), lch(...), color(display-p3 ...)
      const UNSUPPORTED_COLOR_RE = /\b(?:lab|oklch|lch|oklab|color)\s*\(/;
      const SAFE_FALLBACKS: Record<string, string> = {
        color: '#111827',
        fill: '#111827',
        stroke: 'none',
        'background-color': 'transparent',
        'border-color': '#e5e7eb',
        'outline-color': 'transparent',
      };

      const allEls = clonedDoc.getElementsByTagName('*');
      for (let i = 0; i < allEls.length; i++) {
        const el = allEls[i] as HTMLElement;
        if (!el.style) continue;

        let computed: CSSStyleDeclaration;
        try { computed = window.getComputedStyle(el); }
        catch { continue; }

        for (const [prop, fallback] of Object.entries(SAFE_FALLBACKS)) {
          try {
            const val = (computed as any)[prop];
            if (val && UNSUPPORTED_COLOR_RE.test(val)) {
              (el.style as any)[prop] = fallback;
            }
          } catch { /* skip */ }
        }
      }
    },
  } as any);

  // Composite: start with the html2canvas version (which has titles, labels, footer)
  // Then overdraw each map canvas in the correct position
  const ctx = fullPanelCanvas.getContext('2d')!;

  // Find where each leaflet container is positioned within the panel
  const panelRect = panelContainerEl.getBoundingClientRect();
  
  const leafletContainers = Array.from(
    panelContainerEl.querySelectorAll<HTMLElement>('.leaflet-container')
  );

  for (let i = 0; i < leafletContainers.length && i < mapCanvases.length; i++) {
    const lcRect = leafletContainers[i].getBoundingClientRect();
    const relX = (lcRect.left - panelRect.left) * scale;
    const relY = (lcRect.top - panelRect.top) * scale;
    const w = lcRect.width * scale;
    const h = lcRect.height * scale;
    ctx.drawImage(mapCanvases[i], relX, relY, w, h);
  }

  await triggerDownload(fullPanelCanvas, fileName);
}

async function triggerDownload(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('Failed to create blob')); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}
