import { ShapeType, Shape } from 'Cozy';

export class MapObstruction {
    a:PIXI.ObservablePoint;
    b:PIXI.ObservablePoint;
    active:boolean;
    name:string;
    shape:Shape;

    constructor(args:any) {
        this.a = new PIXI.ObservablePoint(this.onMove, this, args.x1, args.y1);
        this.b = new PIXI.ObservablePoint(this.onMove, this, args.x2, args.y2);
        this.name = args.name || null;
        this.active = args.hasOwnProperty('active') ? args.active : true;
    }

    onMove() {
        if (this.shape) {
            this.shape.points = [ [this.a.x,this.a.y], [this.b.x,this.b.y] ];
            this.shape.onChange();
        }
    }

    getShape():Shape {
        if (!this.shape) {
            this.shape = new Shape(
                ShapeType.Polygon, // TODO should be a line
                {
                    closed: false,
                    points: [ [this.a.x,this.a.y], [this.b.x,this.b.y] ],
                    linecolor: 0xaaaaaa
                }
            );
        }

        return this.shape;
    }
}
