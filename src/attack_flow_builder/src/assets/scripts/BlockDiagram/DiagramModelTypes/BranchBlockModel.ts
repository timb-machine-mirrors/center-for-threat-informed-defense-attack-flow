import { RasterCache } from "../DiagramElement/RasterCache";
import { BranchBlockView } from "../DiagramViewTypes";
import {
    AnchorPointModel,
    DiagramObjectModel,
    LayoutUpdateReason
} from ".";
import {
    AnchorAngle,
    BranchBlockStyle,
    BranchBlockTemplate,
    DiagramFactory,
    DiagramObjectValues
} from "../DiagramFactory";
import {
    Alignment,
    Cursor,
    InheritAlignment
} from "../Attributes";
import { Font, titleCase } from "../Utilities";

export class BranchBlockModel extends DiagramObjectModel {

    /**
     * The template the object was configured with.
     */
    public override readonly template: BranchBlockTemplate;

    /**
     * The block's style.
     */
    public readonly style: BranchBlockStyle

    /**
     * The block's render layout.
     */
    public layout: DictionaryBlockRenderLayout;


    /**
     * Creates a new {@link BranchBlockModel}.
     * @param factory
     *  The block's diagram factory.
     * @param template
     *  The block's template.
     * @param values
     *  The block's values.
     */
    constructor(
        factory: DiagramFactory, 
        template: BranchBlockTemplate, 
        values?: DiagramObjectValues
    ) {
        super(factory, template, values);
        this.setInheritAlignment(InheritAlignment.False);
        this.setAlignment(Alignment.Grid);
        this.setCursor(Cursor.Move);
        this.layout = {} as any;
        // Template configuration
        this.setSemanticRole(template.role);
        this.template = template;
        this.style = template.style;
        // Anchor configuration
        if(!this.children.length) {
            let anchor;
            let t = template.anchor_template;
            let a = [AnchorAngle.DEG_0, AnchorAngle.DEG_90];
            // Standard anchors
            for(let i = 0; i < 9; i++) {
                anchor = factory.createObject(t) as AnchorPointModel;
                anchor.angle = a[Math.floor(i / 3) % 2];
                this.addChild(anchor, i, false);
            }
            // Branch anchors
            for(let b of this.template.branches) {
                anchor = factory.createObject(b.anchor_template) as AnchorPointModel;
                anchor.angle = AnchorAngle.DEG_90,
                this.addChild(anchor, this.children.length, false);
            }
        }
        // Property configuration
        this.props.onUpdate(() => {
            this.updateLayout(LayoutUpdateReason.PropUpdate);
        })
        // Update Layout
        this.updateLayout(LayoutUpdateReason.Initialization);
    }
    

    ///////////////////////////////////////////////////////////////////////////
    //  1. Selection  /////////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////


    /**
     * Returns the topmost object at the given coordinate.
     * @param x
     *  The x coordinate.
     * @param y
     *  The y coordinate.
     * @returns
     *  The topmost object, undefined if there isn't one.
     */
    public override getObjectAt(x: number, y: number): DiagramObjectModel | undefined {
        // Try anchors
        let obj = super.getObjectAt(x, y);
        if(obj) {
            return obj;
        }
        // Try object
        let bb = this.boundingBox;
        if(
            bb.xMin <= x && x <= bb.xMax &&
            bb.yMin <= y && y <= bb.yMax  
        ) {
            return this;
        } else {
            return undefined;
        }
    }


    ///////////////////////////////////////////////////////////////////////////
    //  2. Layout & View  /////////////////////////////////////////////////////
    ///////////////////////////////////////////////////////////////////////////


    /**
     * Updates the block's bounding box and render layout.
     * @param reasons
     *  The reasons the layout was updated. 
     * @param updateParent
     *  If the parent's layout should be updated.
     *  (Default: true)
     */
    public override updateLayout(reasons: number, updateParent: boolean = true) {
        let contentHash = this.props.toHashValue();
        let contentChanged = this.layout.contentHash !== contentHash;
        let fullLayoutRequired = reasons & LayoutUpdateReason.Initialization;
        
        // Update layout
        if(fullLayoutRequired || contentChanged) {

            let {
                max_width,
                head,
                body,
                branch,
                horizontal_padding
            } = this.style;
            let {
                branches
            } = this.template;
            let fnf = body.field_name;
            let fvf = body.field_value;
            let text: TextSet[] = [];
            let lines: Line[] = [];
            let strokeWidth = 1;
            
            // Configure title and subtitle
            let titleText = titleCase(this.template.id).toLocaleUpperCase();
            let subtitleText = this.props.isDefined() ? this.props.toString() : "";
            let hasSubtitle = subtitleText !== "";
            let hasBody = this.hasFields();
            let tf = (hasSubtitle ? head.two_title : head.one_title).title;

            // Calculate base width
            let bw = 0;
            for(let b of branches) {
                bw += branch.horizontal_padding;
                bw += branch.font.measureWidth(b.text);
                bw += branch.horizontal_padding + strokeWidth;
            }
            bw -= strokeWidth + (2 * horizontal_padding);

            // Calculate max width
            let mw = max_width;
            mw = Math.max(mw, tf.font.measureWidth(titleText));
            for(let key of this.props.value.keys()) {
                mw = Math.max(mw, body.field_name.font.measureWidth(key));
            }
            mw = Math.max(mw, bw);

            // Calculate text
            let m = null;
            let w = 0;
            let x = strokeWidth + horizontal_padding;
            let y = strokeWidth + head.vertical_padding;
            
            // Create title text set
            let title: TextSet = {
                font: tf.font,
                color: tf.color,
                text: []
            }
            text.push(title);
            
            // Calculate title text
            m = tf.font.measure(titleText);
            w = Math.max(w, m.width);
            y += m.ascent;
            title.text.push({ x, y, t: titleText });
            y += m.descent + ((tf as any).padding ?? 0);

            // Calculate subtitle text
            if(hasSubtitle) {
                let stf = head.two_title.subtitle;

                // Create subtitle text set
                let subtitle: TextSet = {
                    font: stf.font,
                    color: stf.color,
                    text: []
                }
                text.push(subtitle);

                // Calculate subtitle text
                let lines = stf.font.wordWrap(subtitleText, mw);
                m = stf.font.measure(lines[0]);
                w = Math.max(w, m.width);
                y += m.ascent;
                subtitle.text.push({ x, y, t: lines[0] });
                for(let i = 1; i < lines.length; i++) {
                    m = stf.font.measure(lines[i]);
                    w = Math.max(w, m.width);
                    y += stf.line_height;
                    subtitle.text.push({ x, y, t: lines[i] });
                }

            }
            y += head.vertical_padding + strokeWidth;

            // Calculate header height
            let headerHeight =  Math.round(y);

            // Calculate fields
            if(hasBody) {

                // Create field name & value text sets
                let fieldName: TextSet = {
                    font: fnf.font,
                    color: fnf.color,
                    text: []
                }
                let fieldValue: TextSet = {
                    font: fvf.font,
                    color: fvf.color,
                    text: []
                }
                text.push(fieldName);
                text.push(fieldValue);

                // Calculate fields
                y += body.vertical_padding;
                for(let [key, value] of this.props.value) {

                    // Ignore empty fields
                    if(!value.isDefined())
                        continue;

                    // Ignore hidden fields 
                    if(!(value.descriptor.is_visible_chart ?? true))
                        continue;
                    
                    // Ignore the primary key
                    if(key === this.props.primaryKey)
                        continue;
                    
                    // Calculate field name text
                    key = key.toLocaleUpperCase();
                    m = fnf.font.measure(key);
                    w = Math.max(w, m.width);
                    y += m.ascent;
                    fieldName.text.push({ x, y, t: key });
                    y += m.descent + body.field_name.padding;
                    
                    // Calculate field value text
                    let lines = fvf.font.wordWrap(value.toString(), mw);
                    m = fvf.font.measure(lines[0]);
                    w = Math.max(w, m.width);
                    y += m.ascent;
                    fieldValue.text.push({ x, y, t: lines[0] });
                    for(let i = 1; i < lines.length; i++) {
                        m = fvf.font.measure(lines[i]);
                        w = Math.max(w, m.width);
                        y += fvf.line_height;
                        fieldValue.text.push({ x, y, t: lines[i] });
                    }
                    y += body.field_value.padding;
                    
                }
                y -= body.field_value.padding;
                y += body.vertical_padding;

            } else {
                y -= strokeWidth;
            }

            // Create branch text set
            let branchText: TextSet = {
                font: branch.font,
                color: branch.color,
                text: []
            }
            text.push(branchText);

            // Calculate branches
            y += strokeWidth;
            w = Math.max(w, bw) + (2 * horizontal_padding);
            let vp = branch.vertical_padding;
            let _x = strokeWidth;
            let _m = branches.map(b => branch.font.measure(b.text));
            let _h = Math.max(..._m.map(m => m.ascent + m.descent)) + vp * 2;
            let _hh = _h / 2;
            let _hw = w / _m.length / 2;
            
            // Text and line placements
            let x0, y0;
            for(let i = 0; i < _m.length; i++) {
                _x += _hw;
                branchText.text.push({ 
                    x: Math.round(_x - _m[i].width / 2),
                    y: y + Math.round(_hh + (_m[i].ascent / 2)),
                    t: branches[i].text
                });
                _x += _hw;
                x0 = Math.round(_x) + 0.5;
                lines.push({ x0, y0: y, x1: x0, y1: y + _h });
            }
            lines.pop();
            y0 = Math.round(y) - 0.5;
            y += _h;
            
            // Calculate block's size
            let width = Math.round(w + (strokeWidth * 2));
            let height = Math.round(y + strokeWidth);

            // Add block line
            lines.push({ x0: 0, y0, x1: width, y1: y0 });

            // Calculate block's bounding box
            let bb = this.boundingBox;
            let xMin = Math.round(bb.xMid - (width / 2));
            let yMin = Math.round(bb.yMid - (height / 2));
            let xMax = Math.round(bb.xMid + (width / 2));
            let yMax = Math.round(bb.yMid + (height / 2));

            // Update anchors
            let xo = (bb.xMid - xMin) / 2;
            let yo = (bb.yMid - yMin) / 2;
            let anchors = [
                xMin, bb.yMid + yo,
                xMin, bb.yMid,
                xMin, bb.yMid - yo,
                bb.xMid - xo, yMin,
                bb.xMid, yMin,
                bb.xMid + xo, yMin,
                xMax, bb.yMid - yo,
                xMax, bb.yMid,
                xMax, bb.yMid + yo
            ];
            for(let i = 0; i < anchors.length; i += 2) {
                this.children[i / 2].moveTo(anchors[i], anchors[i + 1], false);
            }
            _x = xMin + strokeWidth;
            for(let i = 9; i < this.children.length; i++) {
                _x += _hw;
                this.children[i].moveTo(Math.round(_x), yMax, false);
                _x += _hw;
            }

            // Update object's bounding box
            super.updateLayout(reasons, false);

            // Update layout
            this.layout = {
                contentHash,
                dx: xMin - bb.xMin,
                dy: yMin - bb.yMin,
                width,
                height,
                headerHeight,
                text,
                lines
            };

        }

        // Update parent
        if(updateParent) {
            this.parent?.updateLayout(reasons);
        }
        
    }

    /**
     * Tests if the block has defined fields.
     * @returns
     *  True if the block has defined fields, false otherwise.
     */
    public hasFields() {
        for(let [key, value] of this.props.value) {
            if(key === this.props.primaryKey)
                continue;
            if(!(value.descriptor.is_visible_chart ?? true))
                continue;
            if(value.isDefined())
                return true;
        }
        return false;
    }

    /**
     * Returns this object wrapped inside a view object.
     *  @param cache
     *   The view's raster cache.
     *  @returns
     *   This object wrapped inside a view object.
     */
    public override createView(cache: RasterCache): BranchBlockView {
        return new BranchBlockView(this, cache);
    }

}


///////////////////////////////////////////////////////////////////////////////
//  Internal Types  ///////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////


type DictionaryBlockRenderLayout = {
    
    /**
     * The layout's content hash.
     */
    contentHash: number
    
    /**
     * The block's x offset from the top-left corner of the bounding box.
     */
    dx: number;

    /**
     * The block's y offset from the top-left corner of the bounding box.
     */
    dy: number;

    /**
     * The block's width.
     */
    width: number,

    /**
     * The blocks's height.
     */
    height: number,

    /**
     * The block's header height.
     */
    headerHeight: number

    /**
     * The text to draw.
     */
    text: TextSet[],

    /**
     * The lines to draw
     */
    lines: Line[]

}

type Line = {

    /**
     * The starting x.
     */
    x0: number,

    /**
     * The starting y.
     */
    y0: number,

    /**
     * The ending x.
     */
    x1: number,

    /**
     * The ending y.
     */
    y1: number

}

type TextSet = {

    /**
     * The text's fonts.
     */
    font: Font,

    /**
     * The text's color.
     */
    color: string,

    /**
     * The text placements.
     */
    text: TextPlacement[]

}

type TextPlacement = { 
    
    /**
     * The x-axis coordinate relative to the top-left coordinate of the block.
     */
    x: number,

    /**
     * The y-axis coordinate relative to the top-left coordinate of the block.
     */
    y: number,

    /**
     * The text.
     */
    t: string

}
