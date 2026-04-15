export const MAX_LOGO_SIZE_BYTES = 1_500_000;

export function isImageFile(file) {
  return !!file && typeof file.type === 'string' && file.type.startsWith('image/');
}

function validateImageDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth === 0 || image.naturalHeight === 0) {
        reject(new Error('Could not process image. Please try another file.'));
        return;
      }
      resolve(true);
    };
    image.onerror = () => reject(new Error('Could not process image. Please try another file.'));
    image.src = dataUrl;
  });
}

export function readImageFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!isImageFile(file)) {
      reject(new Error('Please choose an image file.'));
      return;
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      reject(new Error('Image is too large. Please choose one under 1.5 MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const result = String(reader.result || '');
        if (!result.startsWith('data:image/')) {
          throw new Error('Could not process image. Please try another file.');
        }
        await validateImageDataUrl(result);
        resolve(result);
      } catch (error) {
        reject(error instanceof Error ? error : new Error('Could not process image. Please try another file.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read image. Please try again.'));
    reader.readAsDataURL(file);
  });
}

export function getClipboardImageFile(clipboardData) {
  const items = clipboardData?.items || [];
  for (const item of items) {
    if (item.type?.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}
