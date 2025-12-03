import { motion } from "framer-motion";
import {
  Upload,
  FileText,
  Sparkles,
  AlertTriangle,
  Calculator,
  FileCheck,
  TrendingUp,
  RefreshCw,
} from "lucide-react";

interface PipelineStage {
  id: string;
  label: string;
  icon: React.ElementType;
  bgColor: string;
  position: { angle: number };
}

const stages: PipelineStage[] = [
  {
    id: "upload",
    label: "UPLOAD",
    icon: Upload,
    bgColor: "#e9d5ff", // Light purple
    position: { angle: 0 },
  },
  {
    id: "extract",
    label: "EXTRACT",
    icon: FileText,
    bgColor: "#e9d5ff", // Light purple
    position: { angle: 45 },
  },
  {
    id: "analyze",
    label: "ANALYZE",
    icon: Sparkles,
    bgColor: "#e9d5ff", // Light purple
    position: { angle: 90 },
  },
  {
    id: "identify",
    label: "IDENTIFY",
    icon: AlertTriangle,
    bgColor: "#fee2e2", // Light red
    position: { angle: 135 },
  },
  {
    id: "quantify",
    label: "QUANTIFY",
    icon: Calculator,
    bgColor: "#d1fae5", // Light green
    position: { angle: 180 },
  },
  {
    id: "report",
    label: "REPORT",
    icon: FileCheck,
    bgColor: "#d1fae5", // Light green
    position: { angle: 225 },
  },
  {
    id: "recover",
    label: "RECOVER",
    icon: TrendingUp,
    bgColor: "#d1fae5", // Light green
    position: { angle: 270 },
  },
  {
    id: "monitor",
    label: "MONITOR",
    icon: RefreshCw,
    bgColor: "#fee2e2", // Light red
    position: { angle: 315 },
  },
];

const RevenueRecoveryPipeline = () => {
  const centerX = 300;
  const centerY = 300;
  // Elliptical shape - wider horizontally, shorter vertically
  const radiusX = 220; // Horizontal radius (wider)
  const radiusY = 160; // Vertical radius (shorter)

  const getPosition = (angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    // Use elliptical coordinates
    const x = centerX + Math.cos(rad) * radiusX;
    const y = centerY + Math.sin(rad) * radiusY;
    return { x, y };
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto py-12">
      <svg
        viewBox="0 0 600 600"
        className="w-full h-auto"
        style={{ maxHeight: "700px" }}
      >
        {/* Flow arrows - elliptical path with light brown color */}
        {stages.map((stage, index) => {
          const nextIndex = (index + 1) % stages.length;
          const currentAngle = stage.position.angle;
          const nextAngle = stages[nextIndex].position.angle;
          
          // Elliptical arrow path - slightly outside the stage positions
          const arrowRadiusX = radiusX + 32;
          const arrowRadiusY = radiusY + 24;
          const startRad = ((currentAngle - 90) * Math.PI) / 180;
          const endRad = ((nextAngle - 90) * Math.PI) / 180;
          
          const startX = centerX + Math.cos(startRad) * arrowRadiusX;
          const startY = centerY + Math.sin(startRad) * arrowRadiusY;
          
          // Arrowhead position (5 degrees before end)
          const arrowAngle = nextAngle - 5;
          const arrowRad = ((arrowAngle - 90) * Math.PI) / 180;
          const arrowX = centerX + Math.cos(arrowRad) * arrowRadiusX;
          const arrowY = centerY + Math.sin(arrowRad) * arrowRadiusY;
          
          // Calculate tangent angle for elliptical path
          // For ellipse at point (x, y): tangent angle = atan2(-(b²/a²)*x, y)
          const dx = arrowX - centerX;
          const dy = arrowY - centerY;
          const tangentAngle = Math.atan2(-(arrowRadiusY * arrowRadiusY / (arrowRadiusX * arrowRadiusX)) * dx, dy);
          
          let angleDiff = nextAngle - currentAngle;
          if (angleDiff < 0) angleDiff += 360;
          const largeArc = angleDiff > 180 ? 1 : 0;
          
          // Light brown/tan arrow color like Ironclad
          const arrowColor = "#d4a574"; // Light brown/tan
          
          return (
            <g key={`arrow-${index}`}>
              {/* Elliptical arc - light brown */}
              <path
                d={`M ${startX} ${startY} A ${arrowRadiusX} ${arrowRadiusY} 0 ${largeArc} 1 ${arrowX} ${arrowY}`}
                stroke={arrowColor}
                strokeWidth="2"
                fill="none"
                opacity="0.6"
              />
              {/* Arrow head */}
              <path
                d={`M ${arrowX} ${arrowY} L ${arrowX - 16 * Math.cos(tangentAngle - Math.PI / 6)} ${arrowY - 16 * Math.sin(tangentAngle - Math.PI / 6)} L ${arrowX - 16 * Math.cos(tangentAngle + Math.PI / 6)} ${arrowY - 16 * Math.sin(tangentAngle + Math.PI / 6)} Z`}
                fill={arrowColor}
                opacity="0.8"
              />
            </g>
          );
        })}

        {/* Stage nodes - square icons like Ironclad */}
        {stages.map((stage, index) => {
          const pos = getPosition(stage.position.angle);
          const Icon = stage.icon;
          
          return (
            <g key={stage.id}>
              {/* Square icon with rounded corners */}
              <motion.rect
                x={pos.x - 30}
                y={pos.y - 30}
                width="60"
                height="60"
                rx="12"
                fill={stage.bgColor}
                stroke="none"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{
                  delay: index * 0.1,
                  duration: 0.5,
                  type: "spring",
                  stiffness: 200,
                }}
              />
              {/* Icon */}
              <foreignObject
                x={pos.x - 25}
                y={pos.y - 25}
                width="50"
                height="50"
              >
                <div className="flex items-center justify-center w-full h-full">
                  <Icon 
                    className="w-6 h-6" 
                    style={{ color: "#4b5563" }} // Dark grey icon color
                  />
                </div>
              </foreignObject>
              {/* Label below */}
              <text
                x={pos.x}
                y={pos.y + 50}
                textAnchor="middle"
                fill="#374151" // Dark grey text
                fontSize="11"
                fontWeight="600"
                letterSpacing="0.5px"
              >
                {stage.label}
              </text>
            </g>
          );
        })}

        {/* Center - ContractGuard AI - dark grey box like Ironclad */}
        <motion.g
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6, type: "spring" }}
        >
          {/* Dark grey rounded rectangle */}
          <rect
            x={centerX - 85}
            y={centerY - 25}
            width="170"
            height="50"
            rx="12"
            fill="#374151" // Dark grey background
            stroke="#ffffff"
            strokeWidth="2"
          />
          <foreignObject
            x={centerX - 85}
            y={centerY - 25}
            width="170"
            height="50"
          >
            <div className="flex items-center justify-center gap-2.5 w-full h-full">
              <Sparkles className="w-5 h-5 text-white" />
              <span className="text-base font-semibold text-white">
                ContractGuard AI
              </span>
            </div>
          </foreignObject>
        </motion.g>
      </svg>
    </div>
  );
};

export default RevenueRecoveryPipeline;
