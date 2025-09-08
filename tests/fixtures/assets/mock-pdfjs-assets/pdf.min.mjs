// Mock PDF.js Library v4.8.69
// This is a mock file for unit testing Brooklyn MCP PDF.js integration
// Real PDF.js would be downloaded from CDN during asset setup

export const pdfjsLib = {
  version: "4.8.69",
  GlobalWorkerOptions: {
    workerSrc: null
  },
  
  async getDocument(src) {
    return {
      promise: Promise.resolve({
        numPages: 43,
        getPage: (pageNum) => Promise.resolve({
          pageNumber: pageNum,
          getViewport: (params) => ({
            width: 612,
            height: 792,
            transform: [1, 0, 0, 1, 0, 0]
          }),
          render: (renderContext) => ({
            promise: Promise.resolve()
          }),
          getTextContent: () => Promise.resolve({
            items: [
              { str: "R", transform: [12, 0, 0, 12, 74, 669] },
              { str: "e", transform: [12, 0, 0, 12, 88, 669] },
              { str: "t", transform: [12, 0, 0, 12, 102, 669] },
              { str: "a", transform: [12, 0, 0, 12, 116, 669] },
              { str: "i", transform: [12, 0, 0, 12, 130, 669] },
              { str: "l", transform: [12, 0, 0, 12, 144, 669] }
            ]
          })
        })
      })
    };
  }
};

// Mock TextLayer functionality
export const TextLayer = {
  render: (params) => {
    return Promise.resolve({
      textDivs: [
        { textContent: "R", style: { top: "17%", left: "12.08%" } },
        { textContent: "e", style: { top: "17%", left: "15.27%" } },
        { textContent: "t", style: { top: "17%", left: "18.03%" } }
      ]
    });
  }
};

// Export as default for module compatibility
export default pdfjsLib;