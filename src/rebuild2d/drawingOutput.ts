import type { DrawingSheet2D } from "./settings";

export type PaperDrawing = {
  markup: string;
  widthMm: number;
  heightMm: number;
};

const hiddenEditorSelectors = [
  ".hd2-grid",
  ".hd2-marquee",
  ".hd2-cable-hit",
  ".hd2-wire-hit",
  ".hd2-pin-hit",
  ".hd2-route-handle",
  ".hd2-heat-shrink-hit",
  ".hd2-heat-shrink-handle",
  ".hd2-part-symbol-hit",
  ".hd2-annotation-hit",
  ".hd2-annotation-selection",
  ".hd2-annotation-resize",
].join(",");

const exportedStyleProperties = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "text-decoration",
  "letter-spacing",
  "paint-order",
  "color",
  "background-color",
  "border",
  "border-radius",
  "text-align",
  "filter",
  "visibility",
] as const;

export function drawingSheetDimensions(sheet: DrawingSheet2D) {
  if (sheet === "A3") return { widthMm: 420, heightMm: 297 };
  if (sheet === "A2") return { widthMm: 594, heightMm: 420 };
  return { widthMm: 841, heightMm: 594 };
}

export function preparePaperDrawing(source: SVGSVGElement, sheet: DrawingSheet2D): PaperDrawing {
  const clone = source.cloneNode(true) as SVGSVGElement;
  const sourceElements = [source, ...source.querySelectorAll<SVGElement | HTMLElement>("*")];
  const clonedElements = [clone, ...clone.querySelectorAll<SVGElement | HTMLElement>("*")];

  sourceElements.forEach((element, index) => {
    const clonedElement = clonedElements[index];
    if (!clonedElement) return;
    const computed = window.getComputedStyle(element);
    const inlineStyle = exportedStyleProperties
      .map((property) => `${property}:${computed.getPropertyValue(property)}`)
      .join(";");
    clonedElement.setAttribute("style", inlineStyle);
  });

  const sourceInputs = source.querySelectorAll<HTMLInputElement>("input");
  clone.querySelectorAll<HTMLInputElement>("input").forEach((input, index) => {
    input.value = sourceInputs[index]?.value ?? input.value;
    input.setAttribute("value", input.value);
  });

  clone.querySelectorAll<SVGForeignObjectElement>("foreignObject").forEach((foreignObject) => {
    const input = foreignObject.querySelector("input");
    if (!input) return;
    const x = Number(foreignObject.getAttribute("x") ?? 0);
    const y = Number(foreignObject.getAttribute("y") ?? 0);
    const width = Number(foreignObject.getAttribute("width") ?? 0);
    const centered = input.classList.contains("is-centered");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(x + (centered ? width / 2 : 3)));
    text.setAttribute("y", String(y + 10));
    text.setAttribute("text-anchor", centered ? "middle" : "start");
    text.setAttribute("style", input.getAttribute("style") ?? "");
    text.textContent = input.value || "—";
    foreignObject.replaceWith(text);
  });

  clone.querySelectorAll(hiddenEditorSelectors).forEach((element) => element.remove());
  clone.querySelectorAll(".is-selected").forEach((element) => element.classList.remove("is-selected"));

  const content = Array.from(clone.children).find((element) => element.tagName.toLowerCase() === "g");
  content?.removeAttribute("transform");

  const { widthMm, heightMm } = drawingSheetDimensions(sheet);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `0 0 ${widthMm} ${heightMm}`);
  clone.setAttribute("width", `${widthMm}mm`);
  clone.setAttribute("height", `${heightMm}mm`);
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
  clone.classList.remove("is-panning", "is-selecting");
  clone.insertAdjacentHTML("afterbegin", `<rect width="${widthMm}" height="${heightMm}" fill="#ffffff"/>`);

  return {
    markup: new XMLSerializer().serializeToString(clone),
    widthMm,
    heightMm,
  };
}

export async function createDrawingPdfBytes(drawings: PaperDrawing | PaperDrawing[]): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const pages = Array.isArray(drawings) ? drawings : [drawings];
  if (pages.length === 0) throw new Error("PDF로 출력할 하네스 도면이 없습니다.");
  const firstPage = pages[0];
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [firstPage.widthMm, firstPage.heightMm],
    compress: true,
  });

  for (const [index, drawing] of pages.entries()) {
    if (index > 0) pdf.addPage([drawing.widthMm, drawing.heightMm], "landscape");
    pdf.addImage(await renderDrawingJpeg(drawing), "JPEG", 0, 0, drawing.widthMm, drawing.heightMm);
  }
  return new Uint8Array(pdf.output("arraybuffer"));
}

async function renderDrawingJpeg(drawing: PaperDrawing): Promise<string> {
  const canvas = document.createElement("canvas");
  const dotsPerInch = 144;
  canvas.width = Math.round(drawing.widthMm / 25.4 * dotsPerInch);
  canvas.height = Math.round(drawing.heightMm / 25.4 * dotsPerInch);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PDF 렌더링 캔버스를 만들 수 없습니다.");

  const image = new Image();
  const url = URL.createObjectURL(new Blob([drawing.markup], { type: "image/svg+xml;charset=utf-8" }));
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("2D 도면을 PDF 이미지로 변환하지 못했습니다."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.95);
}

export async function printPaperDrawing(drawing: PaperDrawing, requestPrint: () => void | Promise<void> = () => window.print()) {
  const host = document.createElement("div");
  host.className = "hd2-print-output";
  host.innerHTML = drawing.markup;
  const style = document.createElement("style");
  style.className = "hd2-print-style";
  style.textContent = `
    .hd2-print-output { display: none; }
    @page { size: ${drawing.widthMm}mm ${drawing.heightMm}mm; margin: 0; }
    @media print {
      body > *:not(.hd2-print-output) { display: none !important; }
      .hd2-print-output { display: block !important; width: ${drawing.widthMm}mm; height: ${drawing.heightMm}mm; }
      .hd2-print-output svg { display: block; width: ${drawing.widthMm}mm; height: ${drawing.heightMm}mm; }
    }
  `;
  document.body.append(style, host);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    style.remove();
    host.remove();
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  await requestPrint();
  window.setTimeout(cleanup, 5_000);
}
