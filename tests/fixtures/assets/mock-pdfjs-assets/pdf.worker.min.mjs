// Mock PDF.js Worker v4.8.69
// This is a mock worker file for unit testing Brooklyn MCP PDF.js integration
// Real PDF.js worker would be downloaded from CDN during asset setup

// Web Worker interface mock
self.addEventListener("message", function(e) {
  const { type, data } = e.data;
  
  switch (type) {
    case "getDocument":
      // Mock PDF document parsing
      setTimeout(() => {
        self.postMessage({
          type: "documentLoaded",
          data: {
            numPages: 43,
            fingerprint: "mock-pdf-fingerprint",
            info: {
              Title: "Retail Promotion Optimization: Cross-Category Impact Analysis",
              Creator: "Brooklyn MCP Test Suite",
              CreationDate: new Date().toISOString()
            }
          }
        });
      }, 10);
      break;
      
    case "getPage":
      // Mock page rendering
      setTimeout(() => {
        self.postMessage({
          type: "pageReady", 
          data: {
            pageNumber: data.pageNumber,
            viewport: { width: 612, height: 792 },
            textContent: {
              items: generateMockTextItems(data.pageNumber)
            }
          }
        });
      }, 5);
      break;
      
    default:
      console.log("Mock PDF Worker: Unknown message type", type);
  }
});

function generateMockTextItems(pageNumber) {
  if (pageNumber === 1) {
    return [
      { str: "Retail", transform: [16, 0, 0, 16, 72, 720] },
      { str: "Promotion", transform: [16, 0, 0, 16, 150, 720] },
      { str: "Optimization:", transform: [16, 0, 0, 16, 260, 720] },
      { str: "Cross-Category", transform: [12, 0, 0, 12, 72, 680] },
      { str: "Impact", transform: [12, 0, 0, 12, 200, 680] },
      { str: "Analysis", transform: [12, 0, 0, 12, 260, 680] }
    ];
  }
  
  // Generate mock text for other pages
  return Array.from({ length: 20 }, (_, i) => ({
    str: `Page ${pageNumber} Text ${i + 1}`,
    transform: [10, 0, 0, 10, 72 + (i % 5) * 100, 700 - Math.floor(i / 5) * 20]
  }));
}

// Mock worker ready signal
self.postMessage({ type: "ready", data: { version: "4.8.69" } });