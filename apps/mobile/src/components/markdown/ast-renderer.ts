import type { List, Node, Root, Table, TableRow } from "mdast";
import defaultRenderRules from "./render-rules";
import { getMergedStyles } from "./utils";
import type { ReactElement, ReactNode } from "react";
import type {
  StyleMap,
  ASTRendererOptions,
  ListBulletStyle,
  NodeTypeMap,
  RenderFunction,
  RenderRules,
  ValidNodeKey,
} from "./types";

export default class ASTRenderer {
  private _renderRules: RenderRules;
  private _styles: StyleMap;
  private _debug: boolean;
  private _listBulletStyle: ListBulletStyle;
  private _customBulletElement: ReactElement | null;
  private _onLinkPress?: (url: string) => void;

  constructor({
    renderRules,
    styles = null,
    mergeStyle = true,
    debug = false,
    listBulletStyle = "disc",
    customBulletElement = null,
    onLinkPress,
  }: ASTRendererOptions) {
    this._renderRules = {
      ...defaultRenderRules,
      ...renderRules,
    };
    this._styles = getMergedStyles(styles, mergeStyle);
    this._listBulletStyle = listBulletStyle;
    this._debug = debug;
    this._onLinkPress = onLinkPress;
    this._customBulletElement = customBulletElement;
  }

  private get getListBulletCharacter(): string {
    return this._listBulletStyle === "dash" ? "-" : "\u2022";
  }

  private debugLog(length: number, type: string) {
    if (this._debug) {
      console.log(`${" ".repeat(length)}${type}`);
    }
  }

  private getRenderFunction(type: keyof RenderRules): RenderFunction {
    // The registry holds per-node-type render functions (`RenderFunction<K>`),
    // but dispatch happens dynamically from the runtime AST type. Function
    // parameter contravariance makes the per-type entries unassignable to the
    // generic `RenderFunction` without a cast at this boundary.
    const fn = this._renderRules[type];
    if (!fn) {
      console.warn(`Missing render rule for node type: ${type}`);
      // eslint-disable-next-line typescript/no-unsafe-type-assertion
      return (this._renderRules.unknown ?? (() => null)) as RenderFunction;
    }
    // eslint-disable-next-line typescript/no-unsafe-type-assertion
    return fn as RenderFunction;
  }

  private renderNode = (
    node: Node,
    parentStack: Node[] = [],
    extras?: Record<string, unknown>,
  ): ReactNode => {
    const children: ReactNode[] = [];
    // `node.type` is a runtime string; narrow it to the renderer's key union.
    // eslint-disable-next-line typescript/no-unsafe-type-assertion
    const type = node.type as ValidNodeKey;

    if (type === "link" && this._onLinkPress) {
      extras = {
        ...extras,
        onPress: this._onLinkPress,
      };
    }

    if ("children" in node && Array.isArray(node.children)) {
      if (type === "list") {
        // Dispatched by runtime type; narrow to the matching mdast node.
        // eslint-disable-next-line typescript/no-unsafe-type-assertion
        const listNode = node as List;
        const start = listNode.start ?? 1;
        const ordered = listNode.ordered ?? false;

        for (let i = 0; i < listNode.children.length; i++) {
          const listItemNode = listNode.children[i];
          const listStyleType = ordered ? `${start + i}.` : this.getListBulletCharacter;

          const customListStyleType = !ordered && this._customBulletElement;

          if (!listItemNode) {
            console.warn(`Skipping empty list item at index: ${i}`);
            continue;
          }

          const renderedChild = this.renderNode(listItemNode, [node, ...parentStack], {
            listStyleType,
            index: i,
            ordered,
            start,
            customListStyleType,
          });

          children.push(renderedChild);
        }
      } else if (type === "table") {
        // Handle table with header row detection
        // eslint-disable-next-line typescript/no-unsafe-type-assertion
        const tableNode = node as Table;
        for (let i = 0; i < tableNode.children.length; i++) {
          const rowNode = tableNode.children[i];
          if (rowNode) {
            children.push(
              this.renderNode(rowNode, [node, ...parentStack], {
                isHeader: i === 0,
                rowIndex: i,
              }),
            );
          }
        }
      } else if (type === "tableRow") {
        // Handle table row with cell rendering
        // eslint-disable-next-line typescript/no-unsafe-type-assertion
        const tableRowNode = node as TableRow;
        for (let i = 0; i < tableRowNode.children.length; i++) {
          const cellNode = tableRowNode.children[i];
          if (cellNode) {
            children.push(
              this.renderNode(cellNode, [node, ...parentStack], {
                ...extras,
                cellIndex: i,
              }),
            );
          }
        }
      } else {
        for (const child of node.children) {
          children.push(this.renderNode(child, [node, ...parentStack]));
        }
      }
    }

    const renderFunction = this.getRenderFunction(type);
    this.debugLog(parentStack.length, type);

    return renderFunction({
      node: node as NodeTypeMap[typeof type],
      styles: this._styles,
      children,
      parentStack,
      extras,
    });
  };

  public render = (tree: Root): ReactNode => {
    return this.renderNode(tree);
  };
}
