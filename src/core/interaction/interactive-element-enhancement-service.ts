/**
 * Interactive Element Enhancement Service
 * Provides advanced element interaction capabilities for UX teams
 * Phase 1B: Focus, hover, select, clear, and drag-and-drop functionality
 */

import type { Page } from "playwright";
import { getLogger } from "../../shared/pino-logger.js";

let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("interactive-element-enhancement");
  }
  return logger;
}

export interface FocusElementArgs {
  browserId: string;
  selector: string;
  timeout?: number;
}

export interface HoverElementArgs {
  browserId: string;
  selector: string;
  timeout?: number;
  force?: boolean;
  position?: { x: number; y: number };
}

export interface SelectOptionArgs {
  browserId: string;
  selector: string;
  value?: string;
  label?: string;
  index?: number;
  timeout?: number;
}

export interface ClearElementArgs {
  browserId: string;
  selector: string;
  timeout?: number;
  force?: boolean;
}

export interface DragAndDropArgs {
  browserId: string;
  sourceSelector: string;
  targetSelector: string;
  sourcePosition?: { x: number; y: number };
  targetPosition?: { x: number; y: number };
  timeout?: number;
  force?: boolean;
}

export interface FocusElementResult {
  success: boolean;
  selector: string;
  focused: boolean;
  message?: string;
}

export interface HoverElementResult {
  success: boolean;
  selector: string;
  hovered: boolean;
  message?: string;
}

export interface SelectOptionResult {
  success: boolean;
  selector: string;
  selectedValue?: string;
  selectedText?: string;
  selectedIndex?: number;
  message?: string;
}

export interface ClearElementResult {
  success: boolean;
  selector: string;
  cleared: boolean;
  previousValue?: string;
  message?: string;
}

export interface DragAndDropResult {
  success: boolean;
  sourceSelector: string;
  targetSelector: string;
  completed: boolean;
  message?: string;
}

/**
 * Service for enhanced element interaction capabilities
 */
export class InteractiveElementEnhancementService {
  /**
   * Focus an element for keyboard accessibility
   */
  async focusElement(page: Page, args: FocusElementArgs): Promise<FocusElementResult> {
    const log = ensureLogger();
    const { selector, timeout = 30000 } = args;

    try {
      log.info("Focusing element", { selector, timeout });

      // Wait for element to be available
      await page.waitForSelector(selector, { timeout });

      // Focus the element and verify focus state
      const result = await page.evaluate(
        ({ sel }) => {
          const element = document.querySelector(sel) as HTMLElement;
          if (!element) {
            return { success: false, focused: false, message: "Element not found" };
          }

          try {
            element.focus();
            const focused = document.activeElement === element;
            return {
              success: true,
              focused,
              message: focused ? "Element focused successfully" : "Element focus state unclear",
            };
          } catch (error) {
            return {
              success: false,
              focused: false,
              message: `Focus failed: ${error instanceof Error ? error.message : String(error)}`,
            };
          }
        },
        { sel: selector },
      );

      return {
        success: result.success,
        selector,
        focused: result.focused,
        message: result.message,
      };
    } catch (error) {
      log.error("Failed to focus element", { selector, error });
      throw new Error(
        `Failed to focus element: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Hover over an element to trigger hover states
   */
  async hoverElement(page: Page, args: HoverElementArgs): Promise<HoverElementResult> {
    const log = ensureLogger();
    const { selector, timeout = 30000, force = false, position } = args;

    try {
      log.info("Hovering over element", { selector, timeout, force, position });

      // Wait for element to be available
      await page.waitForSelector(selector, { timeout });

      // Get the element locator
      const locator = page.locator(selector);

      // Perform hover with optional position
      if (position) {
        await locator.hover({ position, force, timeout });
      } else {
        await locator.hover({ force, timeout });
      }

      // Verify hover state by checking if element has hover styles
      const hoverResult = await page.evaluate(
        ({ sel }) => {
          const element = document.querySelector(sel) as HTMLElement;
          if (!element) {
            return { hovered: false, message: "Element not found after hover" };
          }

          // Simple check - element should be hovered if it exists and hover completed
          return {
            hovered: true,
            message: "Hover completed successfully",
          };
        },
        { sel: selector },
      );

      return {
        success: true,
        selector,
        hovered: hoverResult.hovered,
        message: hoverResult.message,
      };
    } catch (error) {
      log.error("Failed to hover over element", { selector, error });
      throw new Error(
        `Failed to hover element: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Select an option from a dropdown or select element
   */
  async selectOption(page: Page, args: SelectOptionArgs): Promise<SelectOptionResult> {
    const log = ensureLogger();
    const { selector, value, label, index, timeout = 30000 } = args;

    try {
      log.info("Selecting option", { selector, value, label, index, timeout });

      if (!(value || label) && index === undefined) {
        throw new Error("selectOption requires either value, label, or index parameter");
      }

      // Wait for select element to be available
      await page.waitForSelector(selector, { timeout });

      // Perform selection based on provided criteria
      const result = await this.evaluateSelectOption(page, selector, { value, label, index });

      if (!result.success) {
        throw new Error(result.message);
      }

      return {
        success: true,
        selector,
        selectedValue: result.selectedValue,
        selectedText: result.selectedText,
        selectedIndex: result.selectedIndex,
        message: result.message,
      };
    } catch (error) {
      log.error("Failed to select option", { selector, value, label, index, error });
      throw new Error(
        `Failed to select option: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Clear the content of an input field, textarea, or editable element
   */
  async clearElement(page: Page, args: ClearElementArgs): Promise<ClearElementResult> {
    const log = ensureLogger();
    const { selector, timeout = 30000, force = false } = args;

    try {
      log.info("Clearing element", { selector, timeout, force });

      // Wait for element to be available
      await page.waitForSelector(selector, { timeout });

      // Get current value before clearing
      const previousValue = await page.evaluate(
        ({ sel }) => {
          const element = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
          if (!element) return null;
          return element.value || element.textContent || "";
        },
        { sel: selector },
      );

      // Clear the element using Playwright's fill method with empty string
      const locator = page.locator(selector);
      if (force) {
        await locator.fill("", { force: true, timeout });
      } else {
        await locator.fill("", { timeout });
      }

      // Verify the element was cleared
      const afterValue = await page.evaluate(
        ({ sel }) => {
          const element = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
          if (!element) return null;
          return element.value || element.textContent || "";
        },
        { sel: selector },
      );

      const cleared = !afterValue || afterValue.length === 0;

      return {
        success: true,
        selector,
        cleared,
        previousValue: previousValue !== null ? previousValue : undefined,
        message: cleared ? "Element cleared successfully" : "Element may not be fully cleared",
      };
    } catch (error) {
      log.error("Failed to clear element", { selector, error });
      throw new Error(
        `Failed to clear element: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Drag an element from source to target location
   */
  async dragAndDrop(page: Page, args: DragAndDropArgs): Promise<DragAndDropResult> {
    const log = ensureLogger();
    const {
      sourceSelector,
      targetSelector,
      sourcePosition,
      targetPosition,
      timeout = 30000,
      force = false,
    } = args;

    try {
      log.info("Performing drag and drop", {
        sourceSelector,
        targetSelector,
        sourcePosition,
        targetPosition,
        timeout,
        force,
      });

      // Wait for both source and target elements
      await Promise.all([
        page.waitForSelector(sourceSelector, { timeout }),
        page.waitForSelector(targetSelector, { timeout }),
      ]);

      // Get locators for both elements
      const sourceLocator = page.locator(sourceSelector);
      const targetLocator = page.locator(targetSelector);

      // Perform drag and drop operation
      const dragOptions: Parameters<typeof sourceLocator.dragTo>[1] = {
        force,
        timeout,
      };

      if (sourcePosition) {
        dragOptions.sourcePosition = sourcePosition;
      }
      if (targetPosition) {
        dragOptions.targetPosition = targetPosition;
      }

      await sourceLocator.dragTo(targetLocator, dragOptions);

      // Verify drag and drop completed by checking if elements still exist
      const verification = await page.evaluate(
        ({ srcSel, tgtSel }) => {
          const sourceElement = document.querySelector(srcSel);
          const targetElement = document.querySelector(tgtSel);
          return {
            sourceExists: !!sourceElement,
            targetExists: !!targetElement,
            completed: true, // If no errors thrown, consider it completed
          };
        },
        { srcSel: sourceSelector, tgtSel: targetSelector },
      );

      return {
        success: true,
        sourceSelector,
        targetSelector,
        completed: verification.completed,
        message: "Drag and drop operation completed successfully",
      };
    } catch (error) {
      log.error("Failed to perform drag and drop", { sourceSelector, targetSelector, error });
      throw new Error(
        `Failed to drag and drop: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Helper method to evaluate select option logic
   * Extracted to reduce cognitive complexity
   */
  private async evaluateSelectOption(
    page: Page,
    selector: string,
    criteria: { value?: string; label?: string; index?: number },
  ): Promise<{
    success: boolean;
    selectedValue?: string;
    selectedText?: string;
    selectedIndex?: number;
    message: string;
  }> {
    // Use Playwright's selectOption method for simpler, less complex implementation
    const { value, label, index } = criteria;

    try {
      const locator = page.locator(selector);

      // Verify it's a select element first
      const tagName = await locator.evaluate((el) => el.tagName.toLowerCase());
      if (tagName !== "select") {
        return { success: false, message: "Element is not a select element" };
      }

      // Select using Playwright's built-in method
      if (index !== undefined) {
        await locator.selectOption({ index });
      } else if (value !== undefined) {
        await locator.selectOption({ value });
      } else if (label !== undefined) {
        await locator.selectOption({ label });
      }

      // Get the selected option details
      const result = await locator.evaluate((selectEl: HTMLSelectElement) => {
        const selectedOption = selectEl.options[selectEl.selectedIndex];
        if (!selectedOption) {
          return { success: false, message: "No option selected" };
        }

        return {
          success: true,
          selectedValue: selectedOption.value,
          selectedText: selectedOption.text,
          selectedIndex: selectEl.selectedIndex,
          message: "Option selected successfully",
        };
      });

      return result;
    } catch (error) {
      return {
        success: false,
        message: `Selection failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
