import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import React, { useEffect, useRef } from 'react';

interface ChartProps {
    data: { time: number; open: number; high: number; low: number; close: number }[];
    colors?: {
        backgroundColor?: string;
        textColor?: string;
    };
}

export const ChartComponent: React.FC<ChartProps> = ({
    data,
    colors: {
        backgroundColor = '#161b22',
        textColor = '#c9d1d9',
    } = {}
}) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const seriesRef = useRef<any>(null);
    const chartRef = useRef<any>(null);

    // Create chart ONCE — never recreated on data change
    useEffect(() => {
        if (!chartContainerRef.current) return;
        const container = chartContainerRef.current;

        const chart = createChart(container, {
            layout: {
                background: { type: ColorType.Solid, color: backgroundColor },
                textColor,
            },
            width: container.clientWidth,
            height: container.clientHeight,
            grid: {
                vertLines: { color: '#21262d' },
                horzLines: { color: '#21262d' },
            },
            
            localization: {
                timeFormatter: (time: number) => {
                    // Convert C++ UNIX timestamp (seconds) to JavaScript Date (milliseconds)
                    const date = new Date(time * 1000);
                    // Format to local timezone automatically using 24-hour format
                    return date.toLocaleTimeString(navigator.language, {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false 
                    });
                }
            },
            // 👆 --------------------------------- 👆

            timeScale: {
                timeVisible: true,
                secondsVisible: true,
                borderColor: '#30363d',
                rightOffset: 10,
                barSpacing: 6,
                minBarSpacing: 2,
            },
            rightPriceScale: {
                borderColor: '#30363d',
            },
        });

        const series = chart.addSeries(CandlestickSeries, {
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });

        chartRef.current = chart;
        seriesRef.current = series;

        const handleResize = () => {
            chart.applyOptions({
                width: container.clientWidth,
                height: container.clientHeight,
            });
        };

        const ro = new ResizeObserver(handleResize);
        ro.observe(container);

        return () => {
            ro.disconnect();
            chart.remove();
        };
    }, [backgroundColor, textColor]); // no `data` — chart never rebuilds

    // Update series data separately — no fitContent, no reset
    useEffect(() => {
        if (!seriesRef.current || data.length === 0) return;
        seriesRef.current.setData(data);
    }, [data]);

    return (
        <div
            ref={chartContainerRef}
            style={{ width: '100%', height: '100%' }}
        />
    );
};