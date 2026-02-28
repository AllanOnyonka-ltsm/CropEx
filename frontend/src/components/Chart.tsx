import { createChart, ColorType, CandlestickSeries } from 'lightweight-charts';
import React, { useEffect, useRef } from 'react';

interface ChartProps {
    data: { time: string; open: number; high: number; low: number; close: number }[];
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
            timeScale: {
                timeVisible: true,
                secondsVisible: true,
                borderColor: '#30363d',
            },
            rightPriceScale: {
                borderColor: '#30363d',
            },
        });

        const newSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });

        newSeries.setData(data as any);
        chart.timeScale().fitContent();

        const handleResize = () => {
            if (container) {
                chart.applyOptions({
                    width: container.clientWidth,
                    height: container.clientHeight,
                });
            }
        };

        const resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(container);

        return () => {
            resizeObserver.disconnect();
            chart.remove();
        };
    }, [data, backgroundColor, textColor]);

    return (
        <div
            ref={chartContainerRef}
            style={{ width: '100%', height: '100%' }}
        />
    );
};