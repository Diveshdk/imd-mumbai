import html2canvas from 'html2canvas';

/**
 * Downloads a chart element as a PNG image
 * @param elementId - The DOM element ID of the chart container
 * @param fileName - The base name for the downloaded file (without extension)
 */
export async function downloadChartAsImage(
  elementId: string,
  fileName: string
): Promise<void> {
  const element = document.getElementById(elementId);
  
  if (!element) {
    console.error(`Element with id "${elementId}" not found`);
    throw new Error(`Chart element not found: ${elementId}`);
  }

  try {
    // Capture the element as a canvas
    const canvas = await html2canvas(element, {
      backgroundColor: '#ffffff',
      scale: 2, // Higher quality image
      logging: false,
      useCORS: true,
    } as any);

    // Convert canvas to blob
    canvas.toBlob((blob) => {
      if (!blob) {
        throw new Error('Failed to create image blob');
      }

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}.png`;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 'image/png');
  } catch (error) {
    console.error('Error downloading chart:', error);
    throw error;
  }
}

/**
 * Generates a filename for chart downloads
 * @param metric - The metric name (e.g., 'correctness', 'pod')
 * @param mode - The analysis mode ('day-wise' or 'comparison')
 * @param additionalInfo - Optional additional info (e.g., 'D1', date)
 */
export function generateChartFileName(
  metric: string,
  mode: 'day-wise' | 'comparison',
  additionalInfo?: string
): string {
  const timestamp = new Date().toISOString().split('T')[0];
  const parts = [metric, mode];
  
  if (additionalInfo) {
    parts.push(additionalInfo);
  }
  
  parts.push(timestamp);
  
  return parts.join('_');
}
