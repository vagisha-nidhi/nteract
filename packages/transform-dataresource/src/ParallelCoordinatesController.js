/* @flow */

import * as React from "react";
import { scaleLinear } from "d3-scale";
import { ResponsiveOrdinalFrame, Axis } from "semiotic";
import { colors } from "./charts";
import HTMLLegend from "./HTMLLegend";

type State = {
  filterMode: boolean,
  data: Array<Object>,
  dataScales: Object,
  columnExtent: Object
};

type Props = {
  data: Array<Object>,
  schema: Object,
  options: Object
};

const connectorFunction = d => d.Country;

function parallelizeData(data, metrics, schemaFields, primaryKey) {
  const minmax = {};
  const screenScales = {};

  metrics.forEach(metric => {
    const dataExtent = [
      Math.min(...data.map(d => d[metric.name])),
      Math.max(...data.map(d => d[metric.name]))
    ];

    const minMaxScale = scaleLinear()
      .domain(dataExtent)
      .range([0, 1]);
    minmax[metric.name] = minMaxScale;

    const screenScale = scaleLinear()
      .domain(dataExtent)
      .range([380, 0]);

    screenScales[metric.name] = screenScale;
  });

  const dataPieces = [];
  data.forEach(d => {
    metrics.forEach(metric => {
      const dataPiece = {
        metric: metric.name,
        rawvalue: d[metric.name],
        pctvalue: minmax[metric.name](d[metric.name])
      };
      schemaFields.forEach(field => {
        if (field.type === "string") dataPiece[field.name] = d[field.name];
      });
      primaryKey.forEach(key => {
        dataPiece[key] = d[key];
      });
      dataPieces.push(dataPiece);
    });
  });

  return { dataPieces, scales: screenScales };
}

class ParallelCoordinatesController extends React.Component<Props, State> {
  static defaultProps = {
    metadata: {},
    height: 500
  };

  constructor(props: Props) {
    super(props);

    const { options, data, schema } = this.props;
    const { primaryKey } = options;

    const parallelizeResults = parallelizeData(
      data,
      options.metrics,
      schema.fields,
      primaryKey
    );

    this.state = {
      filterMode: true,
      data: parallelizeResults.dataPieces,
      dataScales: parallelizeResults.scales,
      columnExtent: options.metrics.reduce((p, c) => {
        p[c.name] = undefined;
        return p;
      }, {})
    };
  }

  shouldComponentUpdate(): boolean {
    return true;
  }

  brushing = (e: Array<number>, c: string) => {
    const columnExtent = this.state.columnExtent;
    columnExtent[c] = e;
    this.setState(columnExtent);
  };

  render(): ?React$Element<any> {
    const { options, data, schema } = this.props;

    const { primaryKey, metrics, chart } = options;
    const { dim1 } = chart;

    const { columnExtent } = this.state;

    const hiddenHash = new Map();

    Object.keys(columnExtent).forEach(key => {
      if (columnExtent[key]) {
        const extent = columnExtent[key].sort((a, b) => a - b);
        this.state.data
          .filter(
            d =>
              d.metric === key &&
              (d.pctvalue < extent[0] || d.pctvalue > extent[1])
          )
          .forEach(p => {
            hiddenHash.set(primaryKey.map(key => p[key]).join(","), true);
          });
      }
    });

    const additionalSettings = {};

    const shownData = data.filter(
      d => !hiddenHash.get(primaryKey.map(key => d[key]).join(","))
    );
    const filteredData = shownData.map(d =>
      primaryKey.map(key => d[key]).join(" - ")
    );

    const colorHash = { Other: "grey" };

    if (dim1 && dim1 !== "none") {
      const { uniqueValues, valueHash } = shownData.reduce(
        (p, c) => {
          const v = c[dim1];

          p.valueHash[v] = (p.valueHash[v] && p.valueHash[v] + 1) || 1;

          p.uniqueValues =
            (!p.uniqueValues.find(d => d === v) && [...p.uniqueValues, v]) ||
            p.uniqueValues;

          return p;
        },
        { uniqueValues: [], valueHash: {} }
      );

      uniqueValues.forEach((d: string, i: number) => {
        colorHash[d] = colors[i % colors.length];
      });

      additionalSettings.afterElements =
        uniqueValues.length < 10 ? (
          <HTMLLegend
            values={uniqueValues}
            colorHash={colorHash}
            valueHash={valueHash}
          />
        ) : (
          <p style={{ margin: "20px 0 5px" }}>{filteredData.length} items</p>
        );
    }

    if (!this.state.filterMode)
      additionalSettings.annotations = metrics
        .map(d => ({
          label: "",
          metric: d.name,
          type: "enclose-rect",
          color: "green",
          disable: ["connector"],
          coordinates: [
            { metric: d.name, pctvalue: columnExtent[d.name][0] },
            { metric: d.name, pctvalue: columnExtent[d.name][1] }
          ]
        }))
        .filter(
          d =>
            d.coordinates[0].pctvalue !== 0 || d.coordinates[1].pctvalue !== 1
        );

    return (
      <div>
        <button
          onClick={() => this.setState({ filterMode: !this.state.filterMode })}
        >
          {(this.state.filterMode && "Explore") || "Filter"}
        </button>
        <ResponsiveOrdinalFrame
          data={this.state.data}
          oAccessor="metric"
          rAccessor="pctvalue"
          type={{ type: "point", r: 3 }}
          connectorType={connectorFunction}
          style={d => ({
            fill: hiddenHash.get(primaryKey.map(key => d[key]).join(","))
              ? "lightgray"
              : colorHash[d[dim1]],
            opacity: hiddenHash.get(primaryKey.map(key => d[key]).join(","))
              ? 0.5
              : 0.99
          })}
          connectorStyle={d => ({
            stroke: hiddenHash.get(
              primaryKey.map(key => d.source[key]).join(",")
            )
              ? "gray"
              : colorHash[d.source[dim1]],
            strokeWidth: hiddenHash.get(
              primaryKey.map(key => d.source[key]).join(",")
            )
              ? 1
              : 1.5,
            strokeOpacity: hiddenHash.get(d.source.Country) ? 0.1 : 1
          })}
          responsiveWidth={true}
          margin={{ top: 20, left: 20, right: 20, bottom: 100 }}
          oPadding={40}
          pixelColumnWidth={80}
          interaction={
            this.state.filterMode && {
              columnsBrush: true,
              during: this.brushing,
              extent: this.state.columnExtent
            }
          }
          pieceHoverAnnotation={!this.state.filterMode}
          tooltipContent={d => (
            <div className="tooltip-content">
              <h3>{primaryKey.map(key => d[key]).join(", ")}</h3>
              <h3 style={{ fontSize: "14px" }}>
                {d.metric}: {d.rawvalue}
              </h3>
            </div>
          )}
          canvasPieces={true}
          canvasConnectors={true}
          oLabel={d => (
            <g>
              <text transform="rotate(45)">{d}</text>
              <g transform="translate(-20,-395)">
                <Axis
                  scale={this.state.dataScales[d]}
                  size={[40, 380]}
                  orient="left"
                  ticks={5}
                  tickFormat={d => (
                    <g>
                      <text
                        fill="white"
                        stroke="white"
                        opacity={0.75}
                        strokeWidth={2}
                        textAnchor="end"
                      >
                        {d}
                      </text>
                      <text textAnchor="end">{d}</text>
                    </g>
                  )}
                />
              </g>
            </g>
          )}
          {...additionalSettings}
        />
      </div>
    );
  }
}

export default ParallelCoordinatesController;