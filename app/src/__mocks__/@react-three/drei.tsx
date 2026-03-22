import React from 'react';

export const OrbitControls = () => null;
export const Grid = () => null;
export const Billboard = ({ children, ...props }: any) => <div data-testid="drei-billboard" {...props}>{children}</div>;
export const Text = ({ children, ...props }: any) => <div data-testid="drei-text" {...props}>{children}</div>;
export const Line = ({ points, ...props }: any) => <div data-testid="drei-line" {...props} />;
export const Sphere = (props: any) => <div data-testid="drei-sphere" {...props} />;
export const Cone = (props: any) => <div data-testid="drei-cone" {...props} />;
export const Edges = (props: any) => <div data-testid="drei-edges" {...props} />;
