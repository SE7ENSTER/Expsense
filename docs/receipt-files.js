function readFileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error("Cannot read file."));
    reader.readAsDataURL(file);
  });
}
function placeholderFile(name) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 620;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f8fbff";
    ctx.fillRect(0, 0, 900, 620);
    ctx.fillStyle = "#e11d48";
    ctx.fillRect(70, 70, 170, 220);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 54px Arial";
    ctx.fillText("PDF", 105, 195);
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 38px Arial";
    ctx.fillText("PDF supporting document attached", 280, 145);
    ctx.font = "24px Arial";
    ctx.fillText(String(name || "document.pdf").slice(0, 42), 280, 205);
    ctx.fillStyle = "#64748b";
    ctx.font = "20px Arial";
    ctx.fillText(
      "The original PDF is stored with the report metadata in Phase 1.",
      280,
      255,
    );
    canvas.toBlob(
      (blob) =>
        resolve(
          new File([blob], name || "document.pdf", { type: "image/jpeg" }),
        ),
      "image/jpeg",
      0.82,
    );
  });
}

export async function prepareReceipt(file) {
  const name = file.name || "",
    type = file.type || "";
  const isPdf =
    type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    if (file.size > 500 * 1024)
      throw new Error("PDF file is too large. Please keep PDF below 500 KB.");
    const data = await readFileData(file);
    return {
      file: await placeholderFile(name),
      metadata: {
        receiptFileData: data,
        receiptName: name,
        receiptType: "application/pdf",
        receiptSize: file.size,
      },
    };
  }
  if (!type.startsWith("image/"))
    throw new Error("Please upload an image or PDF receipt.");
  return {
    file,
    metadata: {
      receiptFileData: null,
      receiptName: name,
      receiptType: type,
      receiptSize: file.size,
    },
  };
}
