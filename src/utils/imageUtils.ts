/**
 * 图像本地轻量压缩与 Base64 Data URL 转换工具
 * 纯本地浏览器处理，零外网依赖，保护隐私与密钥
 */

export async function fileToDataUrl(file: File, maxDimension = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    // 如果不是图片文件直接拒绝
    if (!file.type.startsWith('image/')) {
      reject(new Error('所选文件不是有效的图片格式'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片文件失败'));
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (!result) {
        reject(new Error('读取图片内容为空'));
        return;
      }

      // 如果图片较小（小于 800KB），无需 Canvas 压缩直接返回
      if (file.size < 800 * 1024 && !file.type.includes('bmp') && !file.type.includes('tiff')) {
        resolve(result);
        return;
      }

      // 使用 Canvas 进行适度等比缩放与压缩，避免传输给 Vision API 时发生巨大 payload 溢出
      const img = new Image();
      img.onerror = () => resolve(result); // 降级返回原图
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(result);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // 优先转为 JPEG 以大幅降低 Base64 体积
        const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const compressed = canvas.toDataURL(mimeType, quality);
        // 显式释放 Canvas 位图显存
        canvas.width = 0;
        canvas.height = 0;
        resolve(compressed);
      };
      img.src = result;
    };

    reader.readAsDataURL(file);
  });
}

/**
 * 从粘贴事件提取图片文件列表
 */
export function extractImagesFromPaste(event: React.ClipboardEvent | ClipboardEvent): File[] {
  const files: File[] = [];
  const items = event.clipboardData?.items;
  if (!items) return files;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type.indexOf('image') !== -1) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  return files;
}

/**
 * 从拖拽事件提取图片文件列表
 */
export function extractImagesFromDrop(event: React.DragEvent | DragEvent): File[] {
  const files: File[] = [];
  const items = event.dataTransfer?.files;
  if (!items) return files;

  for (let i = 0; i < items.length; i++) {
    const file = items[i];
    if (file.type.startsWith('image/')) {
      files.push(file);
    }
  }
  return files;
}
