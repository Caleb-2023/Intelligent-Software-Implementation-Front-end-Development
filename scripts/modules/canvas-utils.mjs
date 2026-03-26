export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export function drawCoverImage(ctx, image, width, height) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  let offsetX = 0;
  let offsetY = 0;

  if (sourceRatio > targetRatio) {
    drawWidth = height * sourceRatio;
    offsetX = (width - drawWidth) / 2;
  } else {
    drawHeight = width / sourceRatio;
    offsetY = (height - drawHeight) / 2;
  }

  ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
}

export function getColorMap() {
  return {
    graphite: "#38393b",
    berry: "#7f244f",
    ivory: "#e9e5d8",
    stone: "#8b8f94",
    charcoal: "#36383b",
    sand: "#b9a888",
    onyx: "#17181b",
    cream: "#efe8d6",
    plum: "#4a2346"
  };
}
