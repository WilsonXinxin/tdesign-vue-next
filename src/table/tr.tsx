import { defineComponent, PropType, SetupContext, h, computed, ref, reactive, toRefs, watch } from 'vue';
import isFunction from 'lodash/isFunction';
import upperFirst from 'lodash/upperFirst';
import isString from 'lodash/isString';
import pick from 'lodash/pick';
import get from 'lodash/get';
import { formatClassNames, formatRowAttributes, formatRowClassNames } from './utils';
import { getRowFixedStyles, getColumnFixedStyles } from './hooks/useFixed';
import useClassName from './hooks/useClassName';
import TEllipsis from './ellipsis';
import { BaseTableCellParams, TableRowData, RowspanColspan, TdPrimaryTableProps, TdBaseTableProps } from './type';
import baseTableProps from './base-table-props';
import useLazyLoad from './hooks/useLazyLoad';
import { RowAndColFixedPosition } from './interface';
import { getCellKey, SkipSpansValue } from './hooks/useRowspanAndColspan';
import { TooltipProps } from '../tooltip';
import { PaginationProps } from '..';
import { VirtualScrollConfig } from '../hooks/useVirtualScrollNew';
import { AttachNode } from '../common';

export interface RenderTdExtra {
  rowAndColFixedPosition: RowAndColFixedPosition;
  columnLength: number;
  dataLength: number;
  cellSpans: RowspanColspan;
  cellEmptyContent: TdBaseTableProps['cellEmptyContent'];
}

export interface RenderEllipsisCellParams {
  cellNode: any;
}

export type TrCommonProps = Pick<TdPrimaryTableProps, TrPropsKeys>;

export const TABLE_PROPS = [
  'rowKey',
  'rowClassName',
  'columns',
  'fixedRows',
  'footData',
  'rowAttributes',
  'rowspanAndColspan',
  'scroll',
  'cellEmptyContent',
  'pagination',
  'attach',
  'onCellClick',
  'onRowClick',
  'onRowDblclick',
  'onRowMouseover',
  'onRowMousedown',
  'onRowMouseenter',
  'onRowMouseleave',
  'onRowMouseup',
] as const;

export type TrPropsKeys = typeof TABLE_PROPS[number];

export interface TrProps extends TrCommonProps {
  rowKey: string;
  row: TableRowData;
  rowIndex: number;
  ellipsisOverlayClassName: string;
  classPrefix: string;
  dataLength: number;
  rowAndColFixedPosition?: RowAndColFixedPosition;
  skipSpansMap?: Map<string, SkipSpansValue>;
  tableElm?: any;
  // HTMLDivElement
  tableContentElm?: any;
  cellEmptyContent: TdBaseTableProps['cellEmptyContent'];
  virtualConfig: VirtualScrollConfig;
  attach?: AttachNode;
}

export const ROW_LISTENERS = ['click', 'dblclick', 'mouseover', 'mousedown', 'mouseenter', 'mouseleave', 'mouseup'];

export function renderCell(
  params: BaseTableCellParams<TableRowData>,
  slots: SetupContext['slots'],
  extra?: {
    cellEmptyContent?: TdBaseTableProps['cellEmptyContent'];
    pagination?: PaginationProps;
  },
) {
  const { col, row, rowIndex } = params;
  // support serial number column
  if (col.colKey === 'serial-number') {
    const { current, pageSize, defaultCurrent, defaultPageSize } = extra?.pagination || {};
    const tCurrent = current || defaultCurrent;
    const tPageSize = pageSize || defaultPageSize;
    if (tPageSize && tCurrent) {
      return tPageSize * (tCurrent - 1) + rowIndex + 1;
    }
    return rowIndex + 1;
  }
  if (isFunction(col.cell)) {
    return col.cell(h, params);
  }
  if (slots[col.colKey]) {
    return slots[col.colKey](params);
  }
  if (isString(col.cell) && slots[col.cell]) {
    return slots[col.cell](params);
  }
  if (isFunction(col.render)) {
    return col.render(h, { ...params, type: 'cell' });
  }
  const r = get(row, col.colKey);
  // 0 和 false 属于正常可用之，不能使用兜底逻辑 cellEmptyContent
  if (![undefined, '', null].includes(r)) return r;
  // cellEmptyContent 作为空数据兜底显示，用户可自定义
  if (extra?.cellEmptyContent) {
    return isFunction(extra.cellEmptyContent) ? extra.cellEmptyContent(h, params) : extra.cellEmptyContent;
  }
  if (slots.cellEmptyContent) return slots.cellEmptyContent(params);
  if (slots['cell-empty-content']) return slots['cell-empty-content'](params);
  return r;
}

// 表格行组件
export default defineComponent({
  name: 'TR',

  props: {
    row: Object as PropType<TableRowData>,
    rowIndex: Number,
    dataLength: Number,
    ellipsisOverlayClassName: String,
    classPrefix: String,
    rowAndColFixedPosition: Map as PropType<RowAndColFixedPosition>,
    // 合并单元格，是否跳过渲染
    skipSpansMap: Map as PropType<TrProps['skipSpansMap']>,
    virtualConfig: Object as PropType<TrProps['virtualConfig']>,
    ...pick(baseTableProps, TABLE_PROPS),
    // eslint-disable-next-line
    tableElm: {},
    // eslint-disable-next-line
    tableContentElm: {},
  },

  emits: ['row-mounted'],

  setup(props: TrProps, context: SetupContext) {
    const { tableContentElm } = toRefs(props);
    const trRef = ref(null);
    const {
      tdEllipsisClass,
      tableBaseClass,
      tableColFixedClasses,
      tableRowFixedClasses,
      tdAlignClasses,
      tableDraggableClasses,
    } = useClassName();
    const trStyles = computed(() =>
      getRowFixedStyles(
        get(props.row, props.rowKey || 'id'),
        props.rowIndex,
        props.dataLength,
        props.fixedRows,
        props.rowAndColFixedPosition,
        tableRowFixedClasses,
      ),
    );

    const trAttributes = computed(
      () => formatRowAttributes(props.rowAttributes, { row: props.row, rowIndex: props.rowIndex, type: 'body' }) || {},
    );

    const classes = computed(() => {
      const customClasses = formatRowClassNames(
        props.rowClassName,
        { row: props.row, rowIndex: props.rowIndex, type: 'body' },
        props.rowKey || 'id',
      );
      return [trStyles.value?.classes, customClasses].filter((v) => v);
    });

    const { hasLazyLoadHolder, tRowHeight } = useLazyLoad(
      tableContentElm,
      trRef,
      reactive({ ...props.scroll, rowIndex: props.rowIndex }),
    );

    const getTrListeners = (row: TableRowData, rowIndex: number) => {
      const trListeners: { [eventName: string]: (e: MouseEvent) => void } = {};
      // add events to row
      ROW_LISTENERS.forEach((eventName) => {
        trListeners[`on${upperFirst(eventName)}`] = (e: MouseEvent) => {
          const p = { e, row, index: rowIndex };
          props[`onRow${upperFirst(eventName)}`]?.(p);
        };
      });
      return trListeners;
    };

    watch([trRef], () => {
      if (props.virtualConfig?.isVirtualScroll.value) {
        context.emit('row-mounted', {
          ref: trRef,
          data: props.row,
        });
      }
    });

    function renderEllipsisCell(cellParams: BaseTableCellParams<TableRowData>, params: RenderEllipsisCellParams) {
      const { cellNode } = params;
      const { col, colIndex } = cellParams;
      let content = isFunction(col.ellipsis) ? col.ellipsis(h, cellParams) : undefined;
      if (typeof col.ellipsis === 'object' && isFunction(col.ellipsis.content)) {
        content = col.ellipsis.content(h, cellParams);
      }
      let tooltipProps = {};
      if (typeof col.ellipsis === 'object') {
        tooltipProps = 'props' in col.ellipsis ? col.ellipsis.props : col.ellipsis || undefined;
      }
      const tableElement = props.tableElm as HTMLDivElement;
      let placement: TooltipProps['placement'] = colIndex === 0 ? 'top-left' : 'top';
      placement = colIndex === props.columns.length - 1 ? 'top-right' : placement;
      return (
        <TEllipsis
          placement={placement}
          attach={tableElement ? () => tableElement : undefined}
          tooltipContent={content && (() => content)}
          tooltipProps={tooltipProps}
          overlayClassName={props.ellipsisOverlayClassName}
          classPrefix={props.classPrefix}
        >
          {cellNode}
        </TEllipsis>
      );
    }

    function renderTd(params: BaseTableCellParams<TableRowData>, extra: RenderTdExtra) {
      const { col, colIndex, rowIndex } = params;
      const { cellSpans, dataLength, rowAndColFixedPosition } = extra;
      const cellNode = renderCell(params, context.slots, {
        cellEmptyContent: extra.cellEmptyContent,
        pagination: props.pagination,
      });
      const tdStyles = getColumnFixedStyles(col, colIndex, rowAndColFixedPosition, tableColFixedClasses);
      const customClasses = formatClassNames(col.className, { ...params, type: 'td' });
      const classes = [
        tdStyles.classes,
        customClasses,
        {
          [tdEllipsisClass]: col.ellipsis,
          [tableBaseClass.tdLastRow]: rowIndex + cellSpans.rowspan === dataLength,
          [tableBaseClass.tdFirstCol]: colIndex === 0 && props.rowspanAndColspan,
          [tdAlignClasses[col.align]]: col.align && col.align !== 'left',
          // 标记可拖拽列
          [tableDraggableClasses.handle]: col.colKey === 'drag',
        },
      ];
      const onClick = (e: MouseEvent) => {
        const p = { ...params, e };
        if (col.stopPropagation) {
          e.stopPropagation();
        }
        props.onCellClick?.(p);
      };
      const normalAttrs = isFunction(col.attrs) ? col.attrs({ ...params, type: 'td' }) : col.attrs;
      const attrs = { ...normalAttrs, ...cellSpans };
      return (
        <td key={col.colKey || colIndex} class={classes} style={tdStyles.style} {...attrs} onClick={onClick}>
          {col.ellipsis ? renderEllipsisCell(params, { cellNode }) : cellNode}
        </td>
      );
    }

    return () => {
      const { columns, skipSpansMap, row, dataLength, rowAndColFixedPosition } = props;
      const columVNodeList = columns?.map((col, colIndex) => {
        const cellSpans: RowspanColspan = {};
        const params = {
          row,
          col,
          rowIndex: props.rowIndex,
          colIndex,
        };
        let spanState = null;
        if (props.skipSpansMap.size) {
          const cellKey = getCellKey(row, props.rowKey, col.colKey, colIndex);
          spanState = skipSpansMap.get(cellKey) || {};
          spanState?.rowspan > 1 && (cellSpans.rowspan = spanState.rowspan);
          spanState?.colspan > 1 && (cellSpans.colspan = spanState.colspan);
          if (spanState.skipped) return null;
        }
        return renderTd(params, {
          dataLength,
          rowAndColFixedPosition,
          columnLength: columns.length,
          cellSpans,
          cellEmptyContent: props.cellEmptyContent,
        });
      });
      return (
        <tr
          ref="trRef"
          {...trAttributes.value}
          style={trStyles.value?.style}
          class={classes.value}
          {...getTrListeners(row, props.rowIndex)}
        >
          {hasLazyLoadHolder.value
            ? [<td style={{ height: `${tRowHeight.value}px`, border: 'none' }} />]
            : columVNodeList}
        </tr>
      );
    };
  },
});
